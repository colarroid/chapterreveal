"use client";

import { COUNTRIES, REGIONS, regionLabel } from "@/lib/geo";
import { AuthField } from "./auth";
import { Dropdown } from "./dropdown";

export interface ChurchAddress {
  country: string;
  region: string;
  street: string;
}

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.code, label: c.name }));

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[15px] font-medium">{label}</span>
      <div className="mt-2">{children}</div>
    </div>
  );
}

// Country and its state or region side by side, then the street. Countries
// with a known list get a dropdown for the state; anywhere else it is typed.
export function ChurchAddressFields({ value, onChange }: { value: ChurchAddress; onChange: (v: ChurchAddress) => void }) {
  const regions = REGIONS[value.country];
  const label = regionLabel(value.country);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Labelled label="Country">
          <Dropdown
            ariaLabel="Country"
            searchable
            required
            name="country"
            value={value.country}
            // A new country means the old state no longer applies.
            onChange={(country) => onChange({ ...value, country, region: "" })}
            options={COUNTRY_OPTIONS}
            className="h-12 text-[15px] [&>button]:px-5"
          />
        </Labelled>

        {regions ? (
          <Labelled label={label}>
            <Dropdown
              ariaLabel={label}
              required
              name="region"
              placeholder={`Choose a ${label.toLowerCase()}`}
              value={value.region}
              onChange={(region) => onChange({ ...value, region })}
              options={regions.map((r) => ({ value: r, label: r }))}
              className="h-12 text-[15px] [&>button]:px-5"
            />
          </Labelled>
        ) : (
          <AuthField
            label={label}
            name="region"
            autoComplete="address-level1"
            required
            maxLength={80}
            value={value.region}
            onChange={(e) => onChange({ ...value, region: e.target.value })}
          />
        )}
      </div>

      <AuthField
        label="Street address"
        name="street-address"
        autoComplete="street-address"
        placeholder="e.g. 12 Admiralty Way, Lekki Phase 1"
        maxLength={200}
        value={value.street}
        onChange={(e) => onChange({ ...value, street: e.target.value })}
      />
    </div>
  );
}
