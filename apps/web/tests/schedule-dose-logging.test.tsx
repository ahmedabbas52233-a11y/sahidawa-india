/** @jest-environment jsdom */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import SchedulePage from "../app/[locale]/schedule/page";
import { fetchTodaySummary, logDose } from "@/lib/scheduleApi";
import { useSession } from "@/src/components/AuthProvider";
import { toast } from "sonner";

// Mock next-intl
jest.mock("next-intl", () => ({
    useLocale: () => "en",
    useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

// Mock routing Link
jest.mock("@/i18n/routing", () => ({
    Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}));

// Mock scheduleApi
jest.mock("@/lib/scheduleApi", () => ({
    fetchTodaySummary: jest.fn(),
    logDose: jest.fn(),
}));

// Mock AuthProvider session hook
jest.mock("@/src/components/AuthProvider", () => ({
    useSession: jest.fn(),
}));

// Mock sonner toast
jest.mock("sonner", () => ({
    toast: {
        success: jest.fn(),
        error: jest.fn(),
    },
}));

const mockSchedules = [
    {
        id: "schedule-1",
        medicine_name: "Aspirin",
        dosage: "100mg",
        doses: [
            { time: "08:00", status: "none" },
            { time: "20:00", status: "taken" },
        ],
    },
];

describe("SchedulePage Dose Logging Optimistic UI Updates & Error Reverting", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (useSession as any).mockReturnValue({
            token: "valid-token",
            isLoading: false,
        });
        (fetchTodaySummary as any).mockResolvedValue({
            schedules: mockSchedules,
            date: "2026-07-15",
        });
    });

    it("renders daily schedule doses properly", async () => {
        render(<SchedulePage />);

        await waitFor(() => {
            expect(screen.getByText("Aspirin")).toBeInTheDocument();
            expect(screen.getByText("100mg")).toBeInTheDocument();
        });

        // 08:00 dose is currently untracked ("none") -> shows both "Mark Taken" and "Skip"
        expect(screen.getByText("schedule.actionTake")).toBeInTheDocument();
        expect(screen.getByText("schedule.actionSkip")).toBeInTheDocument();

        // 20:00 dose is currently "taken" -> shows only "Taken" button
        expect(screen.getByText("schedule.actionTaken")).toBeInTheDocument();
    });

    it("optimistically updates UI and triggers success toast when logDose API succeeds", async () => {
        (logDose as any).mockResolvedValue({ success: true });

        render(<SchedulePage />);

        // Wait for rendering to complete
        await waitFor(() => {
            expect(screen.getByText("Aspirin")).toBeInTheDocument();
        });

        // Click "Mark Taken" on 08:00 dose
        const takeButton = screen.getByText("schedule.actionTake");
        fireEvent.click(takeButton);

        // Optimistic UI check: count of "Taken" buttons increases to 2
        expect(screen.getAllByText("schedule.actionTaken")).toHaveLength(2);

        // Verify API is called
        await waitFor(() => {
            expect(logDose).toHaveBeenCalledWith("schedule-1", {
                log_date: "2026-07-15",
                log_time: "08:00",
                status: "taken",
            });
        });

        // Verify success toast triggers
        expect(toast.success).toHaveBeenCalledWith("schedule.doseLoggedSuccess", {
            id: "dose-schedule-1-08:00",
        });
    });

    it("optimistically updates UI and reverts to original state with toast error when logDose API fails", async () => {
        (logDose as any).mockRejectedValue(new Error("Network Error"));

        render(<SchedulePage />);

        // Wait for rendering to complete
        await waitFor(() => {
            expect(screen.getByText("Aspirin")).toBeInTheDocument();
        });

        // Click "Mark Taken" on 08:00 dose
        const takeButton = screen.getByText("schedule.actionTake");
        fireEvent.click(takeButton);

        // Optimistic UI check: count of "Taken" buttons increases to 2
        expect(screen.getAllByText("schedule.actionTaken")).toHaveLength(2);

        // Wait for async logDose rejection to complete
        await waitFor(() => {
            expect(logDose).toHaveBeenCalled();
        });

        // UI check: state should revert back to original untracked state (count of "Taken" buttons goes back to 1)
        await waitFor(() => {
            expect(screen.getAllByText("schedule.actionTaken")).toHaveLength(1);
            expect(screen.getByText("schedule.actionTake")).toBeInTheDocument();
            expect(screen.getByText("schedule.actionSkip")).toBeInTheDocument();
        });

        // Verify error text is rendered in components under DoseButton
        expect(screen.getByText("schedule.doseErrorMessage")).toBeInTheDocument();

        // Verify toast.error was triggered
        expect(toast.error).toHaveBeenCalledWith("schedule.doseErrorMessage", {
            id: "dose-schedule-1-08:00",
        });
    });
});
