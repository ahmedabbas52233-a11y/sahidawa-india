jest.mock("../src/services/sms-service", () => ({
    smsService: { send: jest.fn().mockResolvedValue(true) },
}));

jest.mock("../src/services/whatsapp-service", () => ({
    whatsappService: { send: jest.fn().mockResolvedValue(true) },
}));

// Self-contained mock chain — jest.mock factories are hoisted, so nothing
// outside the factory can be referenced here.
jest.mock("../src/db/client", () => {
    const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        range: jest.fn(),
        update: jest.fn().mockReturnThis(),
    };
    return {
        supabase: { from: jest.fn().mockReturnValue(chain) },
        dbConfig: { isSupabaseOffline: false },
    };
});

import { supabase } from "../src/db/client";
import { smsService } from "../src/services/sms-service";
import { broadcastDistrictAlerts, broadcastExpiryAlerts } from "../src/cron/alert-broadcaster";

const mockedSupabase = supabase as jest.Mocked<typeof supabase>;

function getChain() {
    return mockedSupabase.from() as any;
}

describe("broadcastDistrictAlerts", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("marks the alert as broadcasted before paginating subscribers (not after)", async () => {
        const callOrder: string[] = [];
        const chain = getChain();

        chain.select.mockReturnThis();
        chain.eq.mockReturnThis();
        chain.ilike.mockReturnThis();

        // First select(...).eq(...).eq(...) call: fetch unbroadcasted alerts
        let selectCallCount = 0;
        (mockedSupabase.from as jest.Mock).mockImplementation((table: string) => {
            if (table === "district_alerts") {
                return {
                    select: jest.fn().mockImplementation(() => ({
                        eq: jest.fn().mockImplementation(() => ({
                            eq: jest.fn().mockResolvedValue({
                                data: [
                                    {
                                        id: "alert-1",
                                        district: "Delhi",
                                        medicine_name: "Aspirin 500mg",
                                        alert_level: "medium",
                                        is_active: true,
                                        broadcasted: false,
                                    },
                                ],
                                error: null,
                            }),
                        })),
                    })),
                    update: jest.fn().mockImplementation(() => {
                        callOrder.push("mark_broadcasted");
                        return {
                            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
                        };
                    }),
                };
            }
            if (table === "notification_subscribers") {
                selectCallCount += 1;
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            ilike: jest.fn().mockReturnValue({
                                range: jest.fn().mockImplementation(() => {
                                    callOrder.push("fetch_subscribers");
                                    return Promise.resolve({ data: [], error: null });
                                }),
                            }),
                        }),
                    }),
                };
            }
            return chain;
        });

        await broadcastDistrictAlerts();

        expect(callOrder[0]).toBe("mark_broadcasted");
        expect(callOrder).toContain("fetch_subscribers");
    });

    it("does not send notifications when marking broadcasted=true fails", async () => {
        (mockedSupabase.from as jest.Mock).mockImplementation((table: string) => {
            if (table === "district_alerts") {
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            eq: jest.fn().mockResolvedValue({
                                data: [
                                    {
                                        id: "alert-1",
                                        district: "Mumbai",
                                        medicine_name: "Paracetamol",
                                        alert_level: "high",
                                        is_active: true,
                                        broadcasted: false,
                                    },
                                ],
                                error: null,
                            }),
                        }),
                    }),
                    update: jest.fn().mockReturnValue({
                        eq: jest.fn().mockResolvedValue({
                            data: null,
                            error: { message: "DB write failed" },
                        }),
                    }),
                };
            }
            if (table === "notification_subscribers") {
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            ilike: jest.fn().mockReturnValue({
                                range: jest.fn().mockResolvedValue({
                                    data: [
                                        {
                                            id: "sub-1",
                                            phone: "+911234567890",
                                            language: "en",
                                            channels: ["sms"],
                                            district: "Mumbai",
                                            is_active: true,
                                        },
                                    ],
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            return {};
        });

        await broadcastDistrictAlerts();

        // Subscribers must never be paged/notified once marking the alert
        // as broadcasted has failed — otherwise the alert is silently lost
        // (never re-queued) AND notifications could be sent without a
        // durable broadcasted flag, defeating the dedupe guarantee.
        expect(smsService.send).not.toHaveBeenCalled();
    });

    it("does not re-notify already-broadcasted alerts on the next tick", async () => {
        (mockedSupabase.from as jest.Mock).mockImplementation((table: string) => {
            if (table === "district_alerts") {
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            // .eq("broadcasted", false) returns no rows because
                            // the alert was already marked broadcasted=true on
                            // a prior tick (even if that tick's send loop
                            // later failed).
                            eq: jest.fn().mockResolvedValue({ data: [], error: null }),
                        }),
                    }),
                };
            }
            return {};
        });

        await broadcastDistrictAlerts();

        expect(smsService.send).not.toHaveBeenCalled();
    });

    it("matches subscribers via .ilike('district', ...) when the alert is keyed on a real administrative district (#2307)", async () => {
        // Regression for #2307: before the fix, district_alerts rows were
        // keyed on city name (e.g. "Pune") because reports.ts aliased
        // district -> city. Subscribers register with their real district
        // name (e.g. "Pune District"), so the .ilike("district", alert.district)
        // match below would never fire. This test asserts the query is
        // built with the alert's district value and subscribers matching
        // that exact district string are notified.
        let ilikeArgs: unknown[] = [];

        (mockedSupabase.from as jest.Mock).mockImplementation((table: string) => {
            if (table === "district_alerts") {
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            eq: jest.fn().mockResolvedValue({
                                data: [
                                    {
                                        id: "alert-1",
                                        district: "Pune District",
                                        medicine_name: "Aspirin 500mg",
                                        alert_level: "medium",
                                        is_active: true,
                                        broadcasted: false,
                                    },
                                ],
                                error: null,
                            }),
                        }),
                    }),
                    update: jest.fn().mockReturnValue({
                        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                };
            }
            if (table === "notification_subscribers") {
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            ilike: jest.fn().mockImplementation((...args) => {
                                ilikeArgs = args;
                                return {
                                    range: jest.fn().mockResolvedValue({
                                        data: [
                                            {
                                                id: "sub-1",
                                                phone: "+910000000001",
                                                language: "en",
                                                channels: ["sms"],
                                                district: "Pune District",
                                                is_active: true,
                                            },
                                        ],
                                        error: null,
                                    }),
                                };
                            }),
                        }),
                    }),
                };
            }
            return {};
        });

        await broadcastDistrictAlerts();

        expect(ilikeArgs).toEqual(["district", "Pune District"]);
        expect(smsService.send).toHaveBeenCalledTimes(1);
    });
});

describe("broadcastExpiryAlerts", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    function mockBatchesQuery(batches: any[], opts: { gte?: jest.Mock } = {}) {
        const gteSpy = opts.gte || jest.fn();
        return {
            select: jest.fn().mockReturnValue({
                gte: jest.fn().mockImplementation((...args) => {
                    gteSpy(...args);
                    return {
                        lte: jest.fn().mockReturnValue({
                            eq: jest.fn().mockResolvedValue({ data: batches, error: null }),
                        }),
                    };
                }),
            }),
        };
    }

    it("sends exactly one consolidated notification per subscriber, not one per batch", async () => {
        const batches = [
            { id: "batch-1", batch_number: "B1", expiry_date: "2026-07-01", medicine: { brand_name: "Aspirin" } },
            { id: "batch-2", batch_number: "B2", expiry_date: "2026-07-05", medicine: { brand_name: "Paracetamol" } },
            { id: "batch-3", batch_number: "B3", expiry_date: "2026-07-10", medicine: { brand_name: "Ibuprofen" } },
        ];

        (mockedSupabase.from as jest.Mock).mockImplementation((table: string) => {
            if (table === "batches") {
                return {
                    ...mockBatchesQuery(batches),
                    update: jest.fn().mockReturnValue({
                        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                };
            }
            if (table === "notification_subscribers") {
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            range: jest.fn().mockResolvedValue({
                                data: [
                                    { id: "sub-1", phone: "+910000000001", language: "en", channels: ["sms"], is_active: true },
                                    { id: "sub-2", phone: "+910000000002", language: "en", channels: ["sms"], is_active: true },
                                ],
                                error: null,
                            }),
                        }),
                    }),
                };
            }
            return {};
        });

        await broadcastExpiryAlerts();

        // 2 subscribers × 1 consolidated message each = 2 sends total,
        // not 2 subscribers × 3 batches = 6 sends.
        expect(smsService.send).toHaveBeenCalledTimes(2);

        const [firstMessage] = (smsService.send as jest.Mock).mock.calls[0];
        // The single message should reference all three batches.
        expect(typeof firstMessage).toBe("string");
        const [, fullMessage] = (smsService.send as jest.Mock).mock.calls[0];
        expect(fullMessage).toContain("B1");
        expect(fullMessage).toContain("B2");
        expect(fullMessage).toContain("B3");
    });

    it("marks each batch as expiry_broadcasted=true before any notification is sent", async () => {
        const callOrder: string[] = [];
        const batches = [
            { id: "batch-1", batch_number: "B1", expiry_date: "2026-07-01", medicine: { brand_name: "Aspirin" } },
        ];

        (mockedSupabase.from as jest.Mock).mockImplementation((table: string) => {
            if (table === "batches") {
                return {
                    ...mockBatchesQuery(batches),
                    update: jest.fn().mockImplementation(() => {
                        callOrder.push("mark_batch_broadcasted");
                        return {
                            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
                        };
                    }),
                };
            }
            if (table === "notification_subscribers") {
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            range: jest.fn().mockImplementation(() => {
                                callOrder.push("fetch_subscribers");
                                return Promise.resolve({ data: [], error: null });
                            }),
                        }),
                    }),
                };
            }
            return {};
        });

        await broadcastExpiryAlerts();

        expect(callOrder[0]).toBe("mark_batch_broadcasted");
    });

    it("does not re-send to a batch already marked expiry_broadcasted=true after a later subscriber page fails", async () => {
        // Simulates: batch-1 was marked broadcasted on a prior tick. Even if
        // the *current* tick's subscriber fetch fails outright, batch-1 must
        // not reappear in a future query because its flag was already set
        // durably (mark-before-send), independent of subscriber pagination
        // success/failure.
        (mockedSupabase.from as jest.Mock).mockImplementation((table: string) => {
            if (table === "batches") {
                // .eq("expiry_broadcasted", false) returns no rows because
                // batch-1 is already broadcasted=true from a prior tick.
                return mockBatchesQuery([]);
            }
            return {};
        });

        await broadcastExpiryAlerts();

        expect(smsService.send).not.toHaveBeenCalled();
    });

    it("excludes already-expired batches via the lower-bound date filter", async () => {
        const gteSpy = jest.fn();

        (mockedSupabase.from as jest.Mock).mockImplementation((table: string) => {
            if (table === "batches") {
                // No batches returned — simulates the already-expired batch
                // being filtered out by the .gte(expiry_date, today) clause.
                return mockBatchesQuery([], { gte: gteSpy });
            }
            return {};
        });

        await broadcastExpiryAlerts();

        expect(gteSpy).toHaveBeenCalledWith("expiry_date", expect.any(String));
        expect(smsService.send).not.toHaveBeenCalled();
    });

    it("skips a batch and excludes it from the consolidated message if marking it broadcasted fails", async () => {
        const batches = [
            { id: "batch-1", batch_number: "B1", expiry_date: "2026-07-01", medicine: { brand_name: "Aspirin" } },
            { id: "batch-2", batch_number: "B2", expiry_date: "2026-07-05", medicine: { brand_name: "Paracetamol" } },
        ];

        (mockedSupabase.from as jest.Mock).mockImplementation((table: string) => {
            if (table === "batches") {
                return {
                    ...mockBatchesQuery(batches),
                    update: jest.fn().mockImplementation((payload: Record<string, unknown>) => ({
                        eq: jest.fn().mockImplementation((_col: string, id: string) => {
                            if (id === "batch-1") {
                                return Promise.resolve({ data: null, error: { message: "DB write failed" } });
                            }
                            return Promise.resolve({ data: null, error: null });
                        }),
                    })),
                };
            }
            if (table === "notification_subscribers") {
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            range: jest.fn().mockResolvedValue({
                                data: [
                                    { id: "sub-1", phone: "+910000000001", language: "en", channels: ["sms"], is_active: true },
                                ],
                                error: null,
                            }),
                        }),
                    }),
                };
            }
            return {};
        });

        await broadcastExpiryAlerts();

        expect(smsService.send).toHaveBeenCalledTimes(1);
        const [, fullMessage] = (smsService.send as jest.Mock).mock.calls[0];
        expect(fullMessage).not.toContain("B1");
        expect(fullMessage).toContain("B2");
    });
});