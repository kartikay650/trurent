"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import LocationPicker from "./LocationPicker";
import PhotoUploader from "./PhotoUploader";

// ----- Static data --------------------------------------------------------

const LOCALITIES = [
  "Koramangala", "Indiranagar", "HSR Layout", "Whitefield", "Bellandur",
  "Sarjapur Road", "Marathahalli", "BTM Layout", "Jayanagar", "JP Nagar",
  "Banashankari", "Bannerghatta Road", "Hebbal", "Yelahanka", "Electronic City",
  "Bommanahalli", "Hennur", "Frazer Town", "Cunningham Road", "Richmond Town",
  "Ulsoor", "Domlur", "Malleshwaram", "Rajajinagar", "Vijayanagar",
  "RT Nagar", "Old Airport Road", "CV Raman Nagar", "Kasturi Nagar",
  "Kalyan Nagar", "Brookefield", "Hoodi", "Kadugodi", "Mahadevapura",
  "KR Puram", "Banaswadi", "Kammanahalli", "HBR Layout", "Munnekollal",
  "Varthur", "Kasavanahalli", "AECS Layout",
];

const LOCALITY_GEO = {
  Koramangala: [12.9352, 77.6245], Indiranagar: [12.9719, 77.6412],
  "HSR Layout": [12.9116, 77.6389], Whitefield: [12.9698, 77.7499],
  Bellandur: [12.9260, 77.6762], "Sarjapur Road": [12.9010, 77.6961],
  Marathahalli: [12.9591, 77.6971], "BTM Layout": [12.9165, 77.6101],
  Jayanagar: [12.9250, 77.5938], "JP Nagar": [12.8958, 77.5855],
  Banashankari: [12.9141, 77.5467], "Bannerghatta Road": [12.8735, 77.5985],
  Hebbal: [13.0358, 77.5970], Yelahanka: [13.1005, 77.5963],
  "Electronic City": [12.8399, 77.6770], Bommanahalli: [12.8958, 77.6401],
  Hennur: [13.0358, 77.6490], "Frazer Town": [12.9833, 77.6167],
  "Cunningham Road": [12.9833, 77.5933], "Richmond Town": [12.9600, 77.6010],
  Ulsoor: [12.9833, 77.6219], Domlur: [12.9591, 77.6390],
  Malleshwaram: [13.0023, 77.5667], Rajajinagar: [12.9906, 77.5530],
  Vijayanagar: [12.9719, 77.5310], "RT Nagar": [13.0212, 77.5917],
  "Old Airport Road": [12.9606, 77.6489], "CV Raman Nagar": [12.9855, 77.6601],
  "Kasturi Nagar": [13.0100, 77.6550], "Kalyan Nagar": [13.0200, 77.6490],
  Brookefield: [12.9698, 77.7200], Hoodi: [12.9855, 77.7100],
  Kadugodi: [12.9855, 77.7667], Mahadevapura: [12.9940, 77.7010],
  "KR Puram": [13.0094, 77.7053], Banaswadi: [13.0118, 77.6534],
  Kammanahalli: [13.0167, 77.6394], "HBR Layout": [13.0218, 77.6360],
  Munnekollal: [12.9569, 77.7039], Varthur: [12.9404, 77.7466],
  Kasavanahalli: [12.8990, 77.6814], "AECS Layout": [12.9750, 77.7080],
};

const AMENITIES = [
  { key: "gym", label: "Gym" },
  { key: "pool", label: "Pool" },
  { key: "parking", label: "Parking" },
  { key: "power_backup", label: "Power backup" },
  { key: "garden", label: "Garden" },
  { key: "security", label: "Security" },
  { key: "club", label: "Club house" },
];

const BHK_OPTIONS = [
  { value: 1, label: "1 BHK" },
  { value: 2, label: "2 BHK" },
  { value: 3, label: "3 BHK" },
  { value: 4, label: "4 BHK" },
  { value: 5, label: "5+ BHK" },
];

const INITIAL_FORM = {
  listingType: "entire_flat",
  bhk: 2,
  locality: "",
  furnished: "semi",
  sqft: "",
  societyName: "",
  amenities: [],
  rent: "",
  deposit: "",
  genderPreference: "any",
  title: "",
  description: "",
  ownerName: "",
  ownerPhone: "",
};

// ----- Component ----------------------------------------------------------

export default function PostListingPage() {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL_FORM);
  const [pin, setPin] = useState(null); // { lat, lng } | null
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState("editing"); // editing | active | rejected
  const [resultMsg, setResultMsg] = useState("");

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: null }));
  }

  function toggleAmenity(key) {
    setForm((f) => ({
      ...f,
      amenities: f.amenities.includes(key)
        ? f.amenities.filter((a) => a !== key)
        : [...f.amenities, key],
    }));
  }

  // When user picks a locality, recentre the map and (if no pin yet) place
  // the default pin at the locality centroid. This makes the map flow feel
  // connected to the dropdown without forcing the user to pick locality first.
  function onLocalityChange(value) {
    update("locality", value);
    if (value && LOCALITY_GEO[value] && !pin) {
      const [lat, lng] = LOCALITY_GEO[value];
      setPin({ lat, lng });
    }
  }

  const mapCenter = useMemo(() => {
    if (pin) return [pin.lat, pin.lng];
    if (form.locality && LOCALITY_GEO[form.locality]) return LOCALITY_GEO[form.locality];
    return undefined;
  }, [pin, form.locality]);

  function normalizePhone(raw) {
    const cleaned = String(raw || "").replace(/[^\d+]/g, "");
    if (/^\d{10}$/.test(cleaned)) return "+91" + cleaned;
    if (cleaned.startsWith("+")) return cleaned;
    if (/^\d{11,13}$/.test(cleaned)) return "+" + cleaned;
    return cleaned;
  }

  function validate() {
    const errs = {};
    if (!form.title || form.title.trim().length < 8)
      errs.title = "Add a clear title (at least 8 characters).";
    if (form.title.length > 200) errs.title = "Title too long (max 200).";
    if (!form.locality || !LOCALITIES.includes(form.locality))
      errs.locality = "Pick a locality.";
    if (!pin || !Number.isFinite(pin.lat) || !Number.isFinite(pin.lng))
      errs.pin = "Drop a pin on the map at your flat's location.";
    if (![1, 2, 3, 4, 5].includes(parseInt(form.bhk, 10)))
      errs.bhk = "Pick a BHK option.";
    const rent = parseInt(form.rent, 10);
    if (!rent || rent < 5000 || rent > 500000)
      errs.rent = "Rent must be ₹5,000-₹5,00,000.";
    if (form.deposit) {
      const dep = parseInt(form.deposit, 10);
      if (dep < 0 || dep > 5_000_000) errs.deposit = "Check deposit amount.";
    }
    if (form.sqft) {
      const s = parseInt(form.sqft, 10);
      if (!s || s < 100 || s > 10000) errs.sqft = "Square footage must be 100-10000.";
    }
    if (!form.description || form.description.trim().length < 30)
      errs.description = "Describe the flat in at least 30 characters.";
    if (form.description.length > 5000) errs.description = "Too long (max 5000).";
    if (!form.ownerName.trim() || form.ownerName.trim().length < 2)
      errs.ownerName = "Add your name (renters will see it).";
    const phoneNorm = normalizePhone(form.ownerPhone);
    if (!/^\+\d{10,15}$/.test(phoneNorm))
      errs.ownerPhone = "Enter a valid phone number (10 digits or +91...).";
    return { errs, phoneNorm };
  }

  async function submit(e) {
    e.preventDefault();
    const { errs, phoneNorm } = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      // Scroll to the first error so the user sees it without hunting.
      requestAnimationFrame(() => {
        const first = document.querySelector("[data-has-error='true']");
        if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    setSubmitting(true);
    setResultMsg("");

    try {
      const fd = new FormData();
      fd.append("title", form.title.trim());
      fd.append("locality", form.locality);
      fd.append("lat", String(pin.lat));
      fd.append("lng", String(pin.lng));
      fd.append("bhk", String(parseInt(form.bhk, 10)));
      fd.append("rent", String(parseInt(form.rent, 10)));
      fd.append("deposit", String(parseInt(form.deposit, 10) || parseInt(form.rent, 10) * 10));
      fd.append("furnished", form.furnished);
      fd.append("listingType", form.listingType);
      fd.append("genderPreference", form.genderPreference);
      fd.append("amenities", JSON.stringify(form.amenities));
      fd.append("description", form.description.trim());
      fd.append("ownerName", form.ownerName.trim());
      fd.append("ownerPhone", phoneNorm);
      if (form.sqft) fd.append("sqft", String(parseInt(form.sqft, 10)));
      if (form.societyName.trim()) fd.append("societyName", form.societyName.trim());
      for (const file of photos) fd.append("photos", file, file.name);

      const res = await fetch("/api/listings/submit", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Submission failed.");

      setSubmitState(json.status === "active" ? "active" : "rejected");
      setResultMsg(
        json.status === "active"
          ? "Your listing is live on the map. Renters can WhatsApp you directly."
          : `Listing not accepted: ${json.reason || "didn't meet our content guidelines"}. Edit and resubmit.`,
      );
    } catch (err) {
      setResultMsg(err.message);
      setSubmitState("editing");
    } finally {
      setSubmitting(false);
    }
  }

  function reset(keepContact = true) {
    setForm({
      ...INITIAL_FORM,
      ownerName: keepContact ? form.ownerName : "",
      ownerPhone: keepContact ? form.ownerPhone : "",
    });
    setPin(null);
    setPhotos([]);
    setErrors({});
    setResultMsg("");
    setSubmitState("editing");
  }

  // ----- Render -----------------------------------------------------------

  if (submitState !== "editing") {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <Header />
          <ResultState
            ok={submitState === "active"}
            msg={resultMsg}
            onPostAnother={() => reset(true)}
            onGoHome={() => router.push("/")}
          />
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <Header />

        <form onSubmit={submit} noValidate>
          {/* --- 1. WHAT --- */}
          <Section title="What you're listing">
            <ChipRow
              options={[
                { value: "entire_flat", label: "Entire flat" },
                { value: "room", label: "Single room" },
                { value: "pg", label: "PG" },
              ]}
              value={form.listingType}
              onChange={(v) => update("listingType", v)}
            />

            <Field label="Bedrooms" error={errors.bhk}>
              <ChipRow
                options={BHK_OPTIONS}
                value={Number(form.bhk)}
                onChange={(v) => update("bhk", v)}
              />
            </Field>

            <Field label="Furnished">
              <ChipRow
                options={[
                  { value: "fully", label: "Fully" },
                  { value: "semi", label: "Semi" },
                  { value: "unfurnished", label: "Unfurnished" },
                ]}
                value={form.furnished}
                onChange={(v) => update("furnished", v)}
              />
            </Field>

            <Row>
              <Field label="Square footage (optional)" error={errors.sqft}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.sqft}
                  onChange={(e) => update("sqft", e.target.value)}
                  placeholder="e.g. 1100"
                  style={errorInputStyle(errors.sqft)}
                />
              </Field>
              <Field label="Society / building (optional)">
                <input
                  type="text"
                  value={form.societyName}
                  onChange={(e) => update("societyName", e.target.value)}
                  placeholder="e.g. Prestige Lakeside"
                  style={inputStyle}
                />
              </Field>
            </Row>
          </Section>

          {/* --- 2. WHERE --- */}
          <Section title="Where">
            <Field label="Locality" error={errors.locality}>
              <select
                value={form.locality}
                onChange={(e) => onLocalityChange(e.target.value)}
                style={errorInputStyle(errors.locality)}
              >
                <option value="">Pick one...</option>
                {LOCALITIES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </Field>

            <Field
              label="Drop a pin on the map"
              error={errors.pin}
              hint="The exact location stays public on the map. Drag the pin to refine."
            >
              <LocationPicker
                value={pin}
                onChange={setPin}
                initialCenter={mapCenter}
              />
            </Field>
          </Section>

          {/* --- 3. RENT --- */}
          <Section title="Rent and tenants">
            <Row>
              <Field label="Rent (₹/month)" error={errors.rent}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.rent}
                  onChange={(e) => update("rent", e.target.value)}
                  placeholder="25000"
                  style={errorInputStyle(errors.rent)}
                />
              </Field>
              <Field label="Deposit (₹)" error={errors.deposit}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.deposit}
                  onChange={(e) => update("deposit", e.target.value)}
                  placeholder={form.rent ? String(parseInt(form.rent, 10) * 10) : "250000"}
                  style={errorInputStyle(errors.deposit)}
                />
              </Field>
            </Row>
            <Field label="Tenant preference">
              <ChipRow
                options={[
                  { value: "any", label: "Anyone" },
                  { value: "male", label: "Male only" },
                  { value: "female", label: "Female only" },
                ]}
                value={form.genderPreference}
                onChange={(v) => update("genderPreference", v)}
              />
            </Field>
          </Section>

          {/* --- 4. STORY --- */}
          <Section title="Describe it">
            <Field label="Headline" error={errors.title}>
              <input
                type="text"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="e.g. Spacious 2BHK in HSR sector 2, near metro"
                style={errorInputStyle(errors.title)}
              />
            </Field>
            <Field label="Description" error={errors.description}>
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Layout, amenities, distance from key landmarks, move-in date, anything renters should know..."
                rows={6}
                style={{ ...errorInputStyle(errors.description), fontFamily: "inherit", resize: "vertical" }}
              />
              <div
                style={{
                  marginTop: 4,
                  fontSize: 10,
                  color:
                    form.description.length > 4500
                      ? "#B91C1C"
                      : "var(--text-tertiary)",
                  textAlign: "right",
                  fontFamily: "var(--font-dm-mono), monospace",
                }}
              >
                {form.description.length} / 5000
              </div>
            </Field>
            <Field label="Amenities">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {AMENITIES.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => toggleAmenity(a.key)}
                    style={form.amenities.includes(a.key) ? chipActiveStyle : chipStyle}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Photos (optional, up to 5)">
              <PhotoUploader photos={photos} onChange={setPhotos} />
            </Field>
          </Section>

          {/* --- 5. CONTACT --- */}
          <Section title="How renters reach you">
            <Row>
              <Field label="Your name" error={errors.ownerName}>
                <input
                  type="text"
                  value={form.ownerName}
                  onChange={(e) => update("ownerName", e.target.value)}
                  placeholder="First name is fine"
                  style={errorInputStyle(errors.ownerName)}
                  autoComplete="name"
                />
              </Field>
              <Field label="Phone / WhatsApp" error={errors.ownerPhone}>
                <input
                  type="tel"
                  value={form.ownerPhone}
                  onChange={(e) => update("ownerPhone", e.target.value)}
                  placeholder="9876543210"
                  style={errorInputStyle(errors.ownerPhone)}
                  autoComplete="tel"
                />
              </Field>
            </Row>
            <p style={hintStyle}>
              Your number is shown on the public listing so renters can WhatsApp you directly.
              No email required.
            </p>
          </Section>

          {/* --- Submit --- */}
          <div style={{ marginTop: 8 }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                ...primaryButtonStyle,
                width: "100%",
                padding: "12px 18px",
                fontSize: 14,
                opacity: submitting ? 0.7 : 1,
                cursor: submitting ? "wait" : "pointer",
              }}
            >
              {submitting ? "Submitting…" : "Submit listing"}
            </button>
            {resultMsg && (
              <div style={{ marginTop: 12, fontSize: 12, color: "#B91C1C", lineHeight: 1.5 }}>
                {resultMsg}
              </div>
            )}
            {!submitting && Object.keys(errors).length > 0 && (
              <div style={{ marginTop: 12, fontSize: 12, color: "#B91C1C", lineHeight: 1.5 }}>
                Some fields need attention. Scroll up to the highlighted ones.
              </div>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}

// ----- Small subcomponents -----------------------------------------------

function Header() {
  return (
    <div style={{ marginBottom: 24 }}>
      <a href="/" style={{ textDecoration: "none" }}>
        <span style={logoStyle}>
          Tru
          <span style={logoDotStyle} />
          Rent
        </span>
      </a>
      <h1 style={titleStyle}>List your Bangalore flat</h1>
      <p style={subtitleStyle}>
        Direct from owner. Our auto-moderator screens submissions and approved
        listings go live on the map within seconds.
      </p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, error, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }} data-has-error={error ? "true" : "false"}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && !error && (
        <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
          {hint}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#B91C1C", lineHeight: 1.4 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function Row({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {children}
    </div>
  );
}

function ChipRow({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          style={value === opt.value ? chipActiveStyle : chipStyle}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ResultState({ ok, msg, onPostAnother, onGoHome }) {
  return (
    <div style={{ padding: "20px 0" }}>
      <div style={{ fontSize: 36, marginBottom: 12, color: ok ? "#16A34A" : "#B91C1C" }}>
        {ok ? "✓" : "×"}
      </div>
      <h2
        style={{
          fontFamily: "var(--font-playfair), serif",
          fontSize: 22,
          color: "var(--text-primary)",
          marginBottom: 12,
        }}
      >
        {ok ? "Listing live" : "Listing not accepted"}
      </h2>
      <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 20 }}>{msg}</p>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onGoHome} style={primaryButtonStyle}>
          {ok ? "View on map" : "Back to map"}
        </button>
        <button onClick={onPostAnother} style={secondaryButtonStyle}>
          {ok ? "Post another" : "Try again"}
        </button>
      </div>
    </div>
  );
}

function errorInputStyle(error) {
  return error
    ? { ...inputStyle, borderColor: "#B91C1C" }
    : inputStyle;
}

// ----- Styles ------------------------------------------------------------

const pageStyle = {
  minHeight: "100dvh",
  background: "var(--bg-base)",
  padding: "32px 16px 80px",
  fontFamily: "var(--font-dm-sans), sans-serif",
};

const cardStyle = {
  maxWidth: 600,
  margin: "0 auto",
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 12,
  padding: "28px 24px 32px",
};

const logoStyle = {
  fontFamily: "var(--font-playfair), serif",
  fontSize: 22,
  color: "var(--text-primary)",
  letterSpacing: "-0.02em",
};

const logoDotStyle = {
  display: "inline-block",
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--accent-glow)",
  marginLeft: 1,
  verticalAlign: "middle",
};

const titleStyle = {
  marginTop: 14,
  fontSize: 24,
  fontFamily: "var(--font-playfair), serif",
  fontWeight: 400,
  color: "var(--text-primary)",
  letterSpacing: "-0.02em",
};

const subtitleStyle = {
  marginTop: 6,
  fontSize: 13,
  color: "var(--text-secondary)",
  lineHeight: 1.5,
};

const sectionTitleStyle = {
  margin: "0 0 16px",
  paddingBottom: 8,
  borderBottom: "1px solid var(--border-subtle)",
  fontFamily: "var(--font-playfair), serif",
  fontWeight: 400,
  fontSize: 14,
  color: "var(--text-primary)",
  letterSpacing: "0.01em",
};

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-tertiary)",
  marginBottom: 6,
};

const inputStyle = {
  width: "100%",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 6,
  padding: "9px 11px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 120ms ease",
};

const hintStyle = {
  marginTop: -6,
  fontSize: 11,
  color: "var(--text-tertiary)",
  fontStyle: "italic",
  lineHeight: 1.5,
};

const primaryButtonStyle = {
  background: "var(--accent-primary)",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 8,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  display: "inline-block",
};

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

const chipStyle = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 14,
  padding: "5px 12px",
  fontSize: 12,
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const chipActiveStyle = {
  ...chipStyle,
  background: "var(--accent-primary)",
  borderColor: "var(--accent-primary)",
  color: "#FFFFFF",
};
