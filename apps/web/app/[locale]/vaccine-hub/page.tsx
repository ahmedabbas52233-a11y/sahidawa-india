"use client";

import { useState } from "react";
import { vaccineDatabase, VaccineKey, VACCINE_GLOBAL_DISCLAIMER } from "../../../src/constants/vaccineData";

export default function VaccineHubPage() {
  const [selectedVaccine, setSelectedVaccine] = useState<VaccineKey | "">("");
  const [initialDate, setInitialDate] = useState<string>("");

  const vaccine = selectedVaccine ? vaccineDatabase[selectedVaccine] : null;

  // Safely converts tracking week offsets into an absolute calendar string representation
  const calculateMilestoneDate = (weeksOffset: number) => {
    if (!initialDate) return null;

    const reference = new Date(initialDate);
    if (isNaN(reference.getTime())) return null; // Edge-case syntax protection fallback

    const targetDate = new Date(reference.getTime());
    targetDate.setDate(targetDate.getDate() + weeksOffset * 7);

    return targetDate.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">

      {/* HEADER */}
      <div className="max-w-5xl mx-auto mb-6">
        <h1 className="text-3xl font-bold text-emerald-800">
          💉 Vaccine Hub & Immunization Tracker
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Explore vaccine schedules, safety information, and aftercare guidance for better public health awareness.
        </p>
      </div>

      {/* CONTROLS AREA (Dropdown + Optional Dynamic Date Tracker Grid) */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* SELECT DROPDOWN */}
        <div>
          <label className="text-xs font-bold text-emerald-800 uppercase tracking-wider block mb-2">
            Select Disease / Vaccine
          </label>
          <select
            className="w-full p-3 border rounded-lg bg-white shadow-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
            value={selectedVaccine}
            onChange={(e) => {
              setSelectedVaccine(e.target.value as VaccineKey);
              setInitialDate(""); // Clear date tracking context when swapping vaccine targets
            }}
          >
            <option value="">🔎 Choose a Vaccine Profile...</option>
            {(Object.keys(vaccineDatabase) as VaccineKey[]).map((key) => (
              <option key={key} value={key}>
                {vaccineDatabase[key].disease_name}
              </option>
            ))}
          </select>
        </div>

        {/* TIME GENERATOR CONTROL */}
        {vaccine && (
          <div>
            <label className="text-xs font-bold text-emerald-800 uppercase tracking-wider block mb-2">
              {vaccine.is_relative_to_birth ? "Child's Birth Date" : "First Dose Milestone Base Date"}
            </label>
            <input
              type="date"
              className="w-full p-3 border rounded-lg bg-white shadow-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500"
              value={initialDate}
              onChange={(e) => setInitialDate(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* EMPTY STATE */}
      {!vaccine && (
        <div className="max-w-5xl mx-auto bg-white p-10 rounded-xl shadow text-center text-gray-500 border border-gray-100">
          <p className="text-lg font-medium">No vaccine selected</p>
          <p className="text-sm mt-2">Choose a vaccine above to view:</p>
          <ul className="mt-3 text-sm space-y-1 text-gray-600">
            <li>📅 Dynamic projected immunization schedule</li>
            <li>⚠️ Side effects split parameters (mild vs severe)</li>
            <li>🩹 Clinical step-by-step aftercare instructions</li>
          </ul>
        </div>
      )}

      {/* MAIN CONTENT CANVAS */}
      {vaccine && (
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT COLUMN: VACCINE DETAILS METADATA */}
          <div className="bg-white p-5 rounded-xl shadow border border-gray-200 flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-800">{vaccine.disease_name}</h2>
              <p className="text-emerald-700 text-sm font-semibold mt-1">{vaccine.vaccine_name}</p>
              
              <div className="mt-4 text-sm text-gray-600 space-y-2 border-t pt-3 border-gray-100">
                <p><b>Target Groups:</b> {vaccine.target_groups.join(", ")}</p>
                <p><b>Total Doses:</b> {vaccine.total_doses}</p>
                <p><b>Calculated Effectiveness:</b> {vaccine.effectiveness}</p>
                <p><b>Category Classification:</b> {vaccine.category}</p>
              </div>
            </div>

            <div className="mt-6 text-xs text-gray-500 border-t pt-3 border-gray-100 leading-relaxed italic bg-gray-50 p-2.5 rounded">
              {vaccine.disease_summary}
            </div>
          </div>

          {/* MIDDLE & RIGHT COMBINED COLUMN: TIMELINE, SYMPTOMS & SAFETY INSIGHTS */}
          <div className="lg:col-span-2 space-y-4">

            <h3 className="font-bold text-gray-700 flex items-center gap-1">
              <span>📅</span> Immunization Schedule Layout
            </h3>

            {/* GENERATED DOSES RENDER LOOP */}
            {(vaccine.dosing_intervals_weeks || []).map((weeks, index) => {
              const dateString = calculateMilestoneDate(weeks);
              
              // Parse out localized textual schedule indicators dynamically 
              let labelHeader = "";
              if (vaccine.is_relative_to_birth) {
                labelHeader = weeks === 0 ? "At Birth Administration" : `At ${weeks} Weeks of Age`;
              } else {
                labelHeader = index === 0 ? "Initial Administration (Base Line)" : `Dose Step ${index + 1} (+${weeks} weeks later)`;
              }

              return (
                <div
                  key={index}
                  className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl shadow-xs"
                >
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center font-bold text-emerald-800 shrink-0">
                    {index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm sm:text-base">
                      {labelHeader}
                    </p>
                    <p className={`text-xs sm:text-sm mt-0.5 ${dateString ? "text-emerald-700 font-semibold" : "text-amber-600 italic font-medium"}`}>
                      {dateString ? `Target Execution Date: ${dateString}` : "⚠️ Provide a base date calculation reference point to project dates"}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* SIDE EFFECTS CONDITIONAL ARRAYS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100">
                <h4 className="font-bold text-yellow-800 flex items-center gap-1 text-sm">
                  <span>🟢</span> Common Post-Effects
                </h4>
                <ul className="list-disc ml-5 text-xs sm:text-sm mt-2 text-yellow-950 space-y-1">
                  {vaccine.side_effects.common.map((effect, index) => (
                    <li key={index}>{effect}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                <h4 className="font-bold text-red-800 flex items-center gap-1 text-sm">
                  <span>🛑</span> Severe Reactions
                </h4>
                <ul className="list-disc ml-5 text-xs sm:text-sm mt-2 text-red-950 space-y-1">
                  {vaccine.side_effects.severe.map((effect, index) => (
                    <li key={index}>{effect}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* AFTERCARE DATA FRAME */}
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mt-4">
              <h4 className="font-bold text-blue-700 flex items-center gap-1 text-sm">
                <span>🩹</span> Immediate Aftercare Guidance
              </h4>
              <p className="text-xs sm:text-sm mt-1.5 text-blue-950 font-medium leading-relaxed">
                {vaccine.aftercare_text}
              </p>
            </div>

            {/* SYSTEM LEGAL DISCLAIMER FOOTER COMPONENT */}
            <p className="text-[11px] text-gray-400 mt-4 text-center border-t pt-3 border-gray-100 italic leading-normal block">
              {VACCINE_GLOBAL_DISCLAIMER}
            </p>

          </div>
        </div>
      )}
    </div>
  );
}
