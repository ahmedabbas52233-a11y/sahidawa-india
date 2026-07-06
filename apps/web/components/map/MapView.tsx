"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
// Import the hook
import { usePredictivePrefetch } from "../../hooks/usePredictivePrefetch";

interface Pharmacy {
    id: number;
    name: string;
    type: "Jan Aushadhi" | "private";
    lat: number;
    lng: number;
    address: string;
    district: string;
    state: string;
    verified: boolean;
    distance_km: number;
}

interface AshaWorker {
    id: number;
    name: string;
    district: string;
    lat: number;
    lng: number;
    contact: string;
    distance_km: number;
}

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), {
    ssr: false,
});
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((m) => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });

import "leaflet/dist/leaflet.css";
import { CopyButton } from "@/components/ui/CopyButton";
import { greenIcon, blueIcon, orangeIcon } from "./mapIcons";

export default function MapView() {
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
    const [ashaWorkers, setAshaWorkers] = useState<AshaWorker[]>([]);
    const [showPharmacies, setShowPharmacies] = useState(true);
    const [showAsha, setShowAsha] = useState(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);
    const decodeTextareaRef = useRef<HTMLTextAreaElement | null>(null);

    // Function to load map data
    const loadForCoords = async (lat: number, lng: number) => {
        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/map/nearby?lat=${lat}&lng=${lng}&radius_km=10`, {
                signal: controller.signal,
            });
            if (!res.ok) throw new Error("Map API error");
            const data = await res.json();
            setPharmacies(data.pharmacies || []);
            setAshaWorkers(data.asha_workers || []);
        } catch (err) {
            if (!(err instanceof DOMException && err.name === "AbortError")) setError("Unable to load data.");
        } finally {
            setLoading(false);
        }
    };

    // Use the hook to prefetch data when the map enters the viewport
    const mapContainerRef = usePredictivePrefetch({
        preloadQuery: async () => {
            if (userLocation) await loadForCoords(userLocation[0], userLocation[1]);
        },
        threshold: 0.2,
    });

    useEffect(() => {
        let mounted = true;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (!mounted) return;
                const { latitude, longitude } = pos.coords;
                setUserLocation([latitude, longitude]);
                void loadForCoords(latitude, longitude);
            },
            () => {
                if (!mounted) return;
                const fallback: [number, number] = [18.5204, 73.8567];
                setUserLocation(fallback);
                void loadForCoords(fallback[0], fallback[1]);
            }
        );
        return () => { mounted = false; abortControllerRef.current?.abort(); };
    }, []);

    // ... (rest of your component: decodeHtmlEntities and UI remains the same)

    if (!userLocation || loading || error)
        return (
            <div className="p-8 text-center">
                {error ? <div className="text-sm text-red-600">{error}</div> : <span>Loading map…</span>}
            </div>
        );

    return (
        <div className="flex flex-col gap-3">
            {/* Filter toggles ... */}

            {/* Map Container with the ref applied */}
            <div ref={mapContainerRef as any}>
                <MapContainer
                    center={userLocation}
                    zoom={13}
                    style={{ height: "500px", width: "100%" }}
                >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {/* Markers ... */}
                </MapContainer>
            </div>
        </div>
    );
}
