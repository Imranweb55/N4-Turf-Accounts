// ============================================================
// 📚 TURF MANAGER — React.js Version
// ============================================================
// WHAT IS THIS FILE?
//   This is a single React component file (.jsx)
//   JSX = JavaScript + HTML mixed together — React's special syntax
//   One file = entire app (Dashboard, Add Booking, History, Settings)
//
// HOW TO RUN THIS FILE:
//   This runs directly in Claude's Artifact viewer (uses CDN imports)
//   For your own project: npx create-react-app turf-manager
//   Then replace src/App.js content with this code
// ============================================================

// ── STEP 1: IMPORTS ──────────────────────────────────────────
// WHY? React needs to be imported to use JSX (<div>, <button> etc.)
// useState  = to store data that changes (like bookings list)
// useEffect = to run code when component loads or data changes
// useRef    = to reference DOM elements directly
import { useState, useEffect, useRef, useCallback } from "react";

// ── PDF IMPORTS ───────────────────────────────────────────────
// jsPDF  = creates the PDF document
// autoTable = plugin that draws styled tables inside jsPDF
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── STEP 2: CONSTANTS ────────────────────────────────────────
// WHY put constants outside component?
//   They don't change, so no need to recreate them on every render
//   This saves memory and makes React faster

const SPORTS = ["Football", "Cricket", "Badminton", "Basketball", "Other"];

// Default settings if user hasn't configured anything yet
const DEFAULT_SETTINGS = {
  turfName: "My Turf",
  wdPrice: "800", // Weekday rate
  wePrice: "1000", // Weekend rate
  slotDur: "60", // Slot duration in minutes
  scriptUrl: "", // Google Apps Script URL
};

// ── STEP 3: HELPER FUNCTIONS ─────────────────────────────────
// WHY outside component? Pure functions — they don't use React state
// They just take input → return output. Always reusable.

// Get today's date as "2026-06-10" format
// WHY this format? HTML <input type="date"> needs YYYY-MM-DD
function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// Check if a date is Saturday or Sunday
// getDay() returns 0=Sunday, 1=Monday ... 6=Saturday
function isWeekend(dateStr) {
  const d = new Date(dateStr + "T00:00:00"); // T00:00:00 prevents timezone issues
  return d.getDay() === 0 || d.getDay() === 6;
}

// Format numbers as Indian currency: 1500 → "₹1,500"
// toLocaleString('en-IN') adds Indian number formatting
function fmtMoney(n) {
  return "₹" + Math.round(n || 0).toLocaleString("en-IN");
}

// Get rate per hour based on weekday/weekend
function getRateForDate(dateStr, settings) {
  return isWeekend(dateStr)
    ? parseInt(settings.wePrice) || 1000
    : parseInt(settings.wdPrice) || 800;
}

// Convert "12:00 PM" style time to minutes from midnight
// WHY? To calculate duration between two slot times using math
// "1:00 PM" → 780 minutes (13 hours × 60)
function timeToMinutes(timeStr) {
  // timeStr example: "12:00 PM – 1:00 PM", we take only start part
  const part = timeStr.split("–")[0].trim(); // "12:00 PM"
  const [timePart, period] = part.split(" "); // ["12:00", "PM"]
  let [h, m] = timePart.split(":").map(Number); // [12, 0]
  if (period === "PM" && h !== 12) h += 12; // Convert to 24hr
  if (period === "AM" && h === 12) h = 0; // 12:00 AM = midnight
  return h * 60 + m;
}

// Generate all time slots for the day
// WHY? Create array like ["6:00 AM – 7:00 AM", "7:00 AM – 8:00 AM", ...]
function generateSlots(slotDur = 60) {
  const dur = parseInt(slotDur) || 60;
  const slots = [];

  // Format minutes → "6:00 AM" style
  const fmt = (h, mn) => {
    const p = h < 12 ? "AM" : "PM";
    const hh = h % 12 || 12; // 0 → 12, 13 → 1, etc.
    return `${hh}:${String(mn).padStart(2, "0")} ${p}`;
  };

  // Loop from 0 to 1440 (total minutes in a day) in steps of `dur`
  for (let m = 0; m < 1440; m += dur) {
    const h1 = Math.floor(m / 60),
      m1 = m % 60;
    const m2 = m + dur;
    const h2 = Math.floor(m2 / 60) % 24,
      mm2 = m2 % 60;
    slots.push({
      label: `${fmt(h1, m1)} – ${fmt(h2, mm2)}`,
      startMinutes: m,
    });
  }
  return slots;
}

// Determine payment mode from booking object
// WHY? Show correct badge color (blue=GPay, amber=Cash, etc.)
function getPayMode(b) {
  const g = parseFloat(b.payGpay) || 0;
  const c = parseFloat(b.payCash) || 0;
  const a = parseFloat(b.payAdvance) || 0;
  const count = (g > 0 ? 1 : 0) + (c > 0 ? 1 : 0) + (a > 0 ? 1 : 0);
  if (count > 1) return "Mix";
  if (g > 0) return "GPay";
  if (c > 0) return "Cash";
  if (a > 0) return "Advance";
  return "Pending";
}

// Convert Google Sheet row object → our app's booking object
// WHY? Google Sheets returns column names as keys, we want clean field names
function sheetRowToBooking(row) {
  return {
    id: row["Booking ID"] || "BK" + Date.now() + Math.random(),
    date: sheetDateToISO(row["Date"] || ""),
    slotTime: row["Slot Time"] || "",
    slotTimeEnd: row["Slot End Time"] || "",
    isBlock: row["Block Booking"] === "Yes",
    customerName: row["Customer Name"] || "",
    phone: row["Phone"] || "",
    sport: row["Sport"] || "",
    amount: parseFloat(row["Total Amount (₹)"]) || 0,
    discount: parseFloat(row["Discount (₹)"]) || 0,
    discountReason: row["Discount Reason"] || "",
    finalAmount: parseFloat(row["Final Amount (₹)"]) || 0,
    payGpay: parseFloat(row["GPay (₹)"]) || 0,
    payCash: parseFloat(row["Cash (₹)"]) || 0,
    payAdvance: parseFloat(row["Advance (₹)"]) || 0,
    advanceMode: String(row["Advance Mode"] || "").toLowerCase(),
    notes: row["Notes"] || "",
    synced: true,
  };
}

// Convert various date formats → "2026-06-10" ISO format
// WHY? Google Sheets can return dates in multiple formats
function sheetDateToISO(val) {
  if (!val) return "";
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  if (typeof val === "string" && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val)) {
    const p = val.split("/");
    return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
  }
  const d = new Date(val);
  if (!isNaN(d)) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return String(val);
}

// ── STEP 4: GOOGLE SHEETS API (JSONP) ────────────────────────
// WHY JSONP and not fetch()?
//   Google Apps Script has CORS restrictions
//   fetch() from browser gets blocked by CORS
//   JSONP trick: inject <script src="URL?callback=fn">
//   Script tags bypass CORS! Browser runs it directly.
//   Apps Script returns: yourFunctionName({...data...})
//   Browser executes it → your callback function gets the data

function sheetFetch(scriptUrl, params) {
  return new Promise((resolve, reject) => {
    if (!scriptUrl) {
      reject(new Error("Apps Script URL not set. Go to Settings."));
      return;
    }

    // Create unique callback name to avoid conflicts
    // WHY unique? Multiple requests can happen simultaneously
    const cbName = "_gs" + Date.now() + Math.floor(Math.random() * 9999);

    // Timeout: if no response in 20s, reject
    const timer = setTimeout(() => {
      delete window[cbName];
      if (scr.parentNode) scr.parentNode.removeChild(scr);
      reject(new Error("Timeout — check your Apps Script URL"));
    }, 20000);

    // This function will be called by the Script response
    // window[cbName] = make it globally accessible by the injected script
    window[cbName] = (data) => {
      clearTimeout(timer);
      delete window[cbName]; // cleanup
      if (scr.parentNode) scr.parentNode.removeChild(scr);
      resolve(data);
    };

    // Build URL query string: { action: "ping" } → "?action=ping&callback=_gs123"
    const allParams = { ...params, callback: cbName };
    const qs = Object.keys(allParams)
      .map(
        (k) => encodeURIComponent(k) + "=" + encodeURIComponent(allParams[k]),
      )
      .join("&");

    // Inject <script> tag — this is the JSONP trick!
    const scr = document.createElement("script");
    scr.src = scriptUrl + "?" + qs;
    scr.onerror = () => {
      clearTimeout(timer);
      delete window[cbName];
      reject(new Error("Script load failed — verify Apps Script URL"));
    };
    document.head.appendChild(scr);
  });
}

// ── STEP 5: CUSTOM HOOK — useLocalStorage ────────────────────
// WHY a custom hook?
//   We use localStorage in multiple places (settings, bookings)
//   Instead of repeating the same code, we make a reusable "hook"
//   Hooks are just functions that use React's built-in hooks (useState etc.)
//   Convention: hooks always start with "use"
//
// HOW IT WORKS:
//   1. Try to load value from localStorage on first render
//   2. Return [value, setValue] just like useState
//   3. When setValue is called, also save to localStorage
//   4. Next time page loads, localStorage has the value → restored!

function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    // WHY arrow function in useState()?
    //   It runs ONLY on first render (lazy initialization)
    //   Avoids parsing JSON on every single render
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  // Wrap setValue so it also saves to localStorage
  const setValueAndStore = useCallback(
    (newValue) => {
      // WHY useCallback? Prevents re-creating this function on every render
      // Performance optimization
      setValue((prev) => {
        // Allow functional updates: setValueAndStore(prev => prev + 1)
        const resolved =
          typeof newValue === "function" ? newValue(prev) : newValue;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch (e) {
          console.error("LocalStorage save failed:", e);
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, setValueAndStore];
}

// ── STEP 6: SMALL REUSABLE COMPONENTS ────────────────────────
// WHY break UI into components?
//   Reuse the same component in multiple places
//   Easier to read and maintain
//   React re-renders only the component that changed, not everything

// Toast notification (appears at bottom of screen)
// props = data passed FROM parent component TO this component
function Toast({ message, visible }) {
  // Conditional CSS class — add "show" class only when visible=true
  return (
    <div
      style={{
        position: "fixed",
        bottom: 88,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#1a1a1a",
        color: "#fff",
        padding: "10px 18px",
        borderRadius: 10,
        fontSize: 13,
        zIndex: 999,
        // WHY opacity trick instead of display:none?
        // Allows CSS transition (fade in/out animation)
        opacity: visible ? 1 : 0,
        transition: "opacity 0.3s",
        pointerEvents: "none", // Don't block clicks when invisible
        whiteSpace: "nowrap",
        maxWidth: "90vw",
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}

// Badge component — small colored label (GPay, Cash, etc.)
function Badge({ type, children }) {
  // Object map: type → color styles
  // WHY object instead of if/else? Cleaner, easier to add new types
  const styles = {
    gpay: { background: "#e3f2fd", color: "#1565c0" },
    cash: { background: "#fffde7", color: "#b45309" },
    advance: { background: "#ede7f6", color: "#5b21b6" },
    mix: { background: "#e8f5e9", color: "#1a6b38" },
    disc: { background: "#fce4ec", color: "#c2185b" },
    block: { background: "#e8f5e9", color: "#1a472a" },
    free: { background: "#f5f5f5", color: "#999" },
  };
  const s = styles[type] || styles.free;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 6px",
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 700,
        ...s, // Spread operator: merge the color styles
      }}
    >
      {children}
    </span>
  );
}

// Stat card for dashboard summary
function StatCard({ label, value, color, sub, progress }) {
  const colors = {
    green: "#1a6b38",
    blue: "#1565c0",
    amber: "#b45309",
    purple: "#5b21b6",
    red: "#c0392b",
    gray: "#444",
  };
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 13,
        padding: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#999",
          marginBottom: 4,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: colors[color] || "#444",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>{sub}</div>
      )}
      {/* Conditional rendering: only show progress bar if `progress` prop exists */}
      {progress !== undefined && (
        <div
          style={{
            height: 5,
            background: "#eee",
            borderRadius: 3,
            marginTop: 7,
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 3,
              background: "#1a472a",
              width: `${progress}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── STEP 7: MAIN APP COMPONENT ───────────────────────────────
// WHY export default?
//   This marks it as the main component to be rendered
//   In index.js: ReactDOM.render(<App />, document.getElementById('root'))

export default function App() {
  // ── STATE DECLARATIONS ──────────────────────────────────────
  // useState(initialValue) → [currentValue, functionToUpdateIt]
  // WHY useState and not just a variable?
  //   When state changes, React automatically re-renders the component
  //   Regular variables don't trigger re-renders

  // Current page: "dashboard" | "add" | "history" | "settings"
  const [page, setPage] = useState("dashboard");

  // Settings stored in localStorage (persists after page refresh)
  const [settings, setSettings] = useLocalStorage(
    "turf_settings_v2",
    DEFAULT_SETTINGS,
  );

  // Bookings cache: { "2026-06-10": [booking1, booking2], ... }
  const [bookings, setBookings] = useLocalStorage("turf_bookings_v2", {});

  // ── DASHBOARD STATE ──
  const [dashDate, setDashDate] = useState(todayStr());
  // dayBookings = array of bookings for currently selected date
  const [dayBookings, setDayBookings] = useState([]);
  const [dashLoading, setDashLoading] = useState(false);

  // ── ADD BOOKING FORM STATE ──
  // WHY so many useState for form? Each field needs to be tracked separately
  // In React, forms are "controlled" — React controls the input value
  const [addDate, setAddDate] = useState(todayStr());
  const [addSlot, setAddSlot] = useState("");
  const [addSlotEnd, setAddSlotEnd] = useState("");
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addSport, setAddSport] = useState("Football");
  const [addAmount, setAddAmount] = useState(0);
  const [addDiscount, setAddDiscount] = useState(0);
  const [addDiscReason, setAddDiscReason] = useState("");
  const [addGpay, setAddGpay] = useState(0);
  const [addCash, setAddCash] = useState(0);
  const [addAdvance, setAddAdvance] = useState(0);
  const [addAdvMode, setAddAdvMode] = useState(""); // "gpay" | "cash"
  const [addNotes, setAddNotes] = useState("");

  // ── HISTORY STATE ──
  const [histMonth, setHistMonth] = useState("");
  const [histFilter, setHistFilter] = useState("all");
  const [allHistBookings, setAllHistBookings] = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  // ── UI STATE ──
  const [drawer, setDrawer] = useState(null); // null or booking object
  const [toast, setToast] = useState({ msg: "", visible: false });
  const toastTimerRef = useRef(null); // useRef: persist value without re-render

  // ── STEP 8: COMPUTED VALUES (derived from state) ─────────────
  // WHY not store these in state?
  //   They can be calculated from existing state
  //   Storing derived data = risk of inconsistency
  //   Just calculate them fresh whenever needed

  const slots = generateSlots(settings.slotDur);
  const rate = getRateForDate(addDate, settings);
  const finalAmount = Math.max(0, (addAmount || 0) - (addDiscount || 0));
  const totalPaid =
    (parseFloat(addGpay) || 0) +
    (parseFloat(addCash) || 0) +
    (parseFloat(addAdvance) || 0);
  const pendingAmount = Math.max(0, finalAmount - totalPaid);

  // Calculate duration and cost for selected time range
  const startMins = addSlot ? timeToMinutes(addSlot) : 0;
  const endMins = addSlotEnd
    ? timeToMinutes(addSlotEnd) + (parseInt(settings.slotDur) || 60)
    : 0;
  let durationMins = endMins - startMins;
  if (durationMins <= 0 && addSlot && addSlotEnd) durationMins += 1440;
  const durationHrs = durationMins / 60;
  const autoCalcAmount = Math.round(durationHrs * rate);

  // ── STEP 9: useEffect — Side Effects ─────────────────────────
  // WHY useEffect?
  //   Some code should run AFTER rendering (loading data, setting timers)
  //   These are called "side effects" — they affect things outside React
  //
  // useEffect(function, [dependencies])
  //   - function runs after render
  //   - dependencies: re-run when these values change
  //   - [] = empty array means run ONCE when component first mounts

  // Initialize slots on first load
  useEffect(() => {
    if (slots.length > 0 && !addSlot) {
      setAddSlot(slots[0].label);
      setAddSlotEnd(slots[1]?.label || slots[0].label);
    }
  }, []); // WHY []? Run only once — initial setup

  // Initialize history month selector
  useEffect(() => {
    const now = new Date();
    const mk = now.toLocaleDateString("en-IN", {
      month: "short",
      year: "numeric",
    });
    setHistMonth(mk);
  }, []);

  // Auto-recalculate amount when slot/date changes
  useEffect(() => {
    if (autoCalcAmount > 0) {
      setAddAmount(autoCalcAmount);
    }
  }, [
    addSlot,
    addSlotEnd,
    addDate,
    settings.slotDur,
    settings.wdPrice,
    settings.wePrice,
  ]);
  // WHY these dependencies? Recalc when any of these change

  // ── STEP 10: TOAST HELPER ────────────────────────────────────
  function showToast(msg) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, visible: true });
    // Auto-hide after 3 seconds
    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 3000);
  }

  // ── STEP 11: GOOGLE SHEETS FUNCTIONS ─────────────────────────

  // Fetch bookings for a specific date from Google Sheets
  // WHY async/await? Google Sheets API call takes time (network request)
  // async = function can pause and wait for data
  // await = pause here until sheetFetch() resolves/rejects
  const fetchDayBookings = useCallback(
    async (date) => {
      setDashLoading(true);
      try {
        const data = await sheetFetch(settings.scriptUrl, {
          action: "getBookings",
          date: date,
        });
        if (data.status === "ok" && data.bookings) {
          const parsed = data.bookings.map(sheetRowToBooking);
          setDayBookings(parsed);
          // Also update local cache
          setBookings((prev) => ({ ...prev, [date]: parsed }));
        } else {
          // Fallback to local cache if sheet returns error
          setDayBookings(bookings[date] || []);
          showToast("⚠️ Sheet error: " + (data.message || "unknown"));
        }
      } catch (e) {
        // Network error — use cached data
        setDayBookings(bookings[date] || []);
        showToast(
          bookings[date]?.length
            ? "⚠️ Offline — showing cached data"
            : "❌ No data. Check internet + Script URL.",
        );
      }
      setDashLoading(false);
    },
    [settings.scriptUrl, bookings],
  );

  // Load dashboard whenever date changes
  // WHY [dashDate]? Re-run this effect when dashDate changes
  useEffect(() => {
    fetchDayBookings(dashDate);
    // Poll every 30 seconds for real-time updates
    // WHY setInterval? Repeatedly check sheet for new/deleted bookings
    const interval = setInterval(() => fetchDayBookings(dashDate), 30000);
    // WHY return a function? This is the CLEANUP function
    // React calls it before re-running the effect, and when component unmounts
    // Without cleanup: multiple intervals would stack up!
    return () => clearInterval(interval);
  }, [dashDate, settings.scriptUrl]); // WHY scriptUrl? Re-fetch if URL changes

  // ── STEP 12: SAVE BOOKING ────────────────────────────────────
  async function saveBooking() {
    // Validation — check required fields
    if (!addDate || !addName.trim() || !addSlot) {
      showToast("⚠️ Date, name and slot required");
      return;
    }
    const isBlock = addSlot !== addSlotEnd;
    const booking = {
      id: "BK" + Date.now(), // Unique ID using timestamp
      date: addDate,
      slotTime: addSlot,
      slotTimeEnd: addSlotEnd,
      isBlock,
      customerName: addName.trim(),
      phone: addPhone,
      sport: addSport,
      amount: parseFloat(addAmount) || 0,
      discount: parseFloat(addDiscount) || 0,
      discountReason: addDiscReason,
      finalAmount,
      payGpay: parseFloat(addGpay) || 0,
      payCash: parseFloat(addCash) || 0,
      payAdvance: parseFloat(addAdvance) || 0,
      advanceMode: addAdvMode,
      notes: addNotes,
      synced: false, // Mark as not yet synced to sheet
    };

    // Optimistic update: update UI immediately, then sync in background
    // WHY? Makes app feel instant — don't wait for network
    setBookings((prev) => ({
      ...prev, // Keep all existing dates
      [addDate]: [...(prev[addDate] || []), booking], // Add new booking
    }));
    setDayBookings((prev) => [...prev, booking]);

    // Now sync to Google Sheets in background
    syncOneBooking(booking);
    showToast("✅ Booking saved!");
    resetAddForm();
    setPage("dashboard");
  }

  // Send one booking to Google Sheets
  async function syncOneBooking(b) {
    try {
      await sheetFetch(settings.scriptUrl, {
        action: "addBooking",
        id: b.id,
        date: b.date,
        slotTime: b.slotTime,
        slotTimeEnd: b.slotTimeEnd || "",
        isBlock: b.isBlock ? "1" : "0",
        customerName: b.customerName,
        phone: b.phone || "",
        sport: b.sport || "",
        amount: b.amount || 0,
        discount: b.discount || 0,
        discountReason: b.discountReason || "",
        finalAmount: b.finalAmount || 0,
        payGpay: b.payGpay || 0,
        payCash: b.payCash || 0,
        payAdvance: b.payAdvance || 0,
        advanceMode: b.advanceMode || "",
        notes: b.notes || "",
      });
      // Mark as synced in local storage
      setBookings((prev) => {
        const updated = { ...prev };
        if (updated[b.date]) {
          updated[b.date] = updated[b.date].map((x) =>
            x.id === b.id ? { ...x, synced: true } : x,
          );
        }
        return updated;
      });
    } catch (e) {
      console.warn("Sync failed:", e);
    }
  }

  function resetAddForm() {
    setAddName("");
    setAddPhone("");
    setAddNotes("");
    setAddDiscount(0);
    setAddDiscReason("");
    setAddGpay(0);
    setAddCash(0);
    setAddAdvance(0);
    setAddAdvMode("");
    // Reset amount to auto-calculated value
    setAddAmount(autoCalcAmount);
  }

  // ── STEP 13: HISTORY LOAD ────────────────────────────────────
  const loadHistory = useCallback(
    async (monthKey) => {
      setHistLoading(true);
      setAllHistBookings([]);
      try {
        const data = await sheetFetch(settings.scriptUrl, {
          action: "getBookings",
          month: monthKey,
        });
        if (data.status === "ok" && data.bookings) {
          const parsed = data.bookings.map(sheetRowToBooking);
          // Sort by date descending (newest first)
          parsed.sort((a, b) => b.date.localeCompare(a.date));
          setAllHistBookings(parsed);
          // Update local cache for each date
          const byDate = {};
          parsed.forEach((b) => {
            if (!byDate[b.date]) byDate[b.date] = [];
            byDate[b.date].push(b);
          });
          setBookings((prev) => ({ ...prev, ...byDate }));
        }
      } catch (e) {
        showToast("⚠️ Offline — showing cached data");
        // Fallback: filter local cache by month
        const fallback = [];
        Object.keys(bookings).forEach((date) => {
          const d = new Date(date + "T00:00:00");
          const mk = d.toLocaleDateString("en-IN", {
            month: "short",
            year: "numeric",
          });
          if (mk === monthKey) {
            (bookings[date] || []).forEach((b) =>
              fallback.push({ ...b, date }),
            );
          }
        });
        fallback.sort((a, b) => b.date.localeCompare(a.date));
        setAllHistBookings(fallback);
      }
      setHistLoading(false);
    },
    [settings.scriptUrl, bookings],
  );

  // When history page opens or month changes
  useEffect(() => {
    if (page === "history" && histMonth) {
      loadHistory(histMonth);
    }
  }, [page, histMonth, settings.scriptUrl]);

  // ── STEP 14: COMPUTED DASHBOARD STATS ────────────────────────
  // WHY recalculate here instead of in render?
  //   Cleaner render code — separate logic from presentation
  const dashStats = (() => {
    let total = 0,
      gpay = 0,
      cash = 0,
      adv = 0,
      pending = 0;
    dayBookings.forEach((b) => {
      const g = parseFloat(b.payGpay) || 0;
      const c = parseFloat(b.payCash) || 0;
      const a = parseFloat(b.payAdvance) || 0;
      const fin = parseFloat(b.finalAmount) || parseFloat(b.amount) || 0;
      gpay += g;
      cash += c;
      adv += a;
      total += g + c + a;
      pending += Math.max(0, fin - (g + c + a));
    });
    const bookedSlots = new Set(dayBookings.map((b) => b.slotTime)).size;
    const occ = Math.round((bookedSlots / (slots.length || 1)) * 100);
    return { total, gpay, cash, adv, pending, bookedSlots, occ };
  })(); // WHY ()()? IIFE — immediately invoked function expression. Calculate once, store result.

  // ── STEP 15: MONTH SELECTOR OPTIONS ──────────────────────────
  const monthOptions = (() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      // Array.from({ length: 12 }) creates [undefined × 12]
      // (_, i) → _ = unused value, i = index 0..11
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    });
  })();

  // ── STEP 16: HISTORY FILTERING ───────────────────────────────
  const filteredHistory = allHistBookings.filter((b) => {
    if (histFilter === "pending") {
      const fin = parseFloat(b.finalAmount) || parseFloat(b.amount) || 0;
      const paid =
        (parseFloat(b.payGpay) || 0) +
        (parseFloat(b.payCash) || 0) +
        (parseFloat(b.payAdvance) || 0);
      return fin > paid;
    }
    if (histFilter === "GPay") return (parseFloat(b.payGpay) || 0) > 0;
    if (histFilter === "Cash") return (parseFloat(b.payCash) || 0) > 0;
    if (histFilter === "Advance") return (parseFloat(b.payAdvance) || 0) > 0;
    if (histFilter === "Mix") {
      const g = (parseFloat(b.payGpay) || 0) > 0;
      const c = (parseFloat(b.payCash) || 0) > 0;
      const a = (parseFloat(b.payAdvance) || 0) > 0;
      return (g ? 1 : 0) + (c ? 1 : 0) + (a ? 1 : 0) > 1;
    }
    return true;
  });

  // ── STEP 17: DELETE BOOKING ───────────────────────────────────
  async function deleteBooking(b) {
    if (!window.confirm(`Cancel booking for ${b.customerName}?`)) return;
    // Remove from local state
    setBookings((prev) => ({
      ...prev,
      [b.date]: (prev[b.date] || []).filter((x) => x.id !== b.id),
    }));
    setDayBookings((prev) => prev.filter((x) => x.id !== b.id));
    setDrawer(null);
    showToast("🗑 Booking removed");
    // Note: To also delete from Google Sheets, your Apps Script
    // needs a "deleteBooking" action. Add it there and call:
    // await sheetFetch(settings.scriptUrl, { action: "deleteBooking", id: b.id });
  }

  // ── STEP 18: COLLECT MORE PAYMENT ────────────────────────────
  const [moreGpay, setMoreGpay] = useState(0);
  const [moreCash, setMoreCash] = useState(0);

  function submitMorePayment(b) {
    const addG = parseFloat(moreGpay) || 0;
    const addC = parseFloat(moreCash) || 0;
    const updated = {
      ...b,
      payGpay: (parseFloat(b.payGpay) || 0) + addG,
      payCash: (parseFloat(b.payCash) || 0) + addC,
      synced: false,
    };
    setBookings((prev) => ({
      ...prev,
      [b.date]: (prev[b.date] || []).map((x) => (x.id === b.id ? updated : x)),
    }));
    setDayBookings((prev) => prev.map((x) => (x.id === b.id ? updated : x)));
    syncOneBooking(updated);
    setDrawer(null);
    setMoreGpay(0);
    setMoreCash(0);
    showToast("✅ Payment updated!");
  }

  // ── STEP 19: SYNC ALL ─────────────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  async function syncAll() {
    setSyncing(true);
    let count = 0;
    for (const date of Object.keys(bookings)) {
      for (const b of bookings[date] || []) {
        if (!b.synced) {
          await syncOneBooking(b);
          count++;
          await new Promise((r) => setTimeout(r, 200)); // Small delay
        }
      }
    }
    setSyncing(false);
    showToast(
      count > 0 ? `✅ Synced ${count} booking(s)!` : "✅ All synced already",
    );
  }

  async function testConn() {
    if (!settings.scriptUrl) {
      showToast("❌ Set Script URL in Settings first");
      return;
    }
    showToast("🔌 Testing...");
    try {
      const d = await sheetFetch(settings.scriptUrl, { action: "ping" });
      showToast(
        d.status === "ok"
          ? "✅ Connected! " + (d.message || "")
          : "⚠️ " + d.message,
      );
    } catch (e) {
      showToast("❌ " + e.message);
    }
  }

  // ── STEP 20: NAVIGATION HANDLER ──────────────────────────────
  function handleNav(pageName) {
    setPage(pageName);
    // Reset history filter when switching tabs
    if (pageName === "history") setHistFilter("all");
  }

  function quickAdd(date, slotLabel) {
    setAddDate(date);
    setAddSlot(slotLabel);
    const idx = slots.findIndex((s) => s.label === slotLabel);
    setAddSlotEnd(slots[idx + 1]?.label || slotLabel);
    setPage("add");
  }

  // ── STEP 21: RENDER (JSX) ─────────────────────────────────────
  // WHY return JSX?
  //   React calls render() (or the return of a function component)
  //   to know what HTML to show
  //   JSX looks like HTML but it's JavaScript — compiled to React.createElement()
  //
  // Rules of JSX:
  //   1. Must return ONE root element (use <div> or <> fragment)
  //   2. className instead of class (class is reserved in JS)
  //   3. style={{}} — double braces: outer={} = JS expression, inner{} = object
  //   4. onClick not onclick (camelCase)
  //   5. Self-closing tags: <br /> not <br>

  return (
    <div
      style={{
        maxWidth: 480,
        margin: "0 auto",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f0f4f0",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: 15,
        color: "#1a1a1a",
      }}
    >
      {/* ═══════════════════════════════════════
          DASHBOARD PAGE
      ═══════════════════════════════════════ */}
      {/* WHY conditional rendering with &&?
          page === "dashboard" is true/false
          true && <JSX> → shows JSX
          false && <JSX> → shows nothing */}
      {page === "dashboard" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            paddingBottom: 80,
            overflowY: "auto",
          }}
        >
          {/* Header */}
          <div
            style={{
              background: "#1a472a",
              color: "#fff",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 24 }}>⚽</div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                {settings.turfName}
              </h1>
              <p style={{ fontSize: 11, opacity: 0.65, marginTop: 1 }}>
                {new Date(dashDate + "T00:00:00").toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <button
                onClick={syncAll}
                disabled={syncing}
                style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  color: "white",
                  padding: "6px 11px",
                  borderRadius: 8,
                  fontSize: 12,
                  cursor: "pointer",
                  opacity: syncing ? 0.6 : 1,
                }}
              >
                {syncing ? "Syncing…" : "↻ Sync"}
              </button>
            </div>
          </div>

          {/* Date bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              background: "#fff",
              borderBottom: "1px solid #eee",
            }}
          >
            {/* Controlled input: value={dashDate} + onChange = React controls this input */}
            <input
              type="date"
              value={dashDate}
              onChange={(e) => setDashDate(e.target.value)}
              style={{
                flex: 1,
                border: "1.5px solid #ddd",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 14,
                color: "#1a1a1a",
                background: "#f8f8f8",
                outline: "none",
              }}
            />
            <span
              style={{
                background: isWeekend(dashDate) ? "#fff3e0" : "#e8f5e9",
                color: isWeekend(dashDate) ? "#e65100" : "#1a6b38",
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 6,
                whiteSpace: "nowrap",
              }}
            >
              {isWeekend(dashDate) ? "Weekend" : "Weekday"} · ₹
              {isWeekend(dashDate) ? settings.wePrice : settings.wdPrice}
            </span>
            <button
              onClick={() => setDashDate(todayStr())}
              style={{
                background: "#1a472a",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "8px 13px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Today
            </button>
          </div>

          {/* Stats grid */}
          <div
            style={{
              padding: "12px 14px 6px",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <h2 style={{ fontSize: 14, fontWeight: 700 }}>Today's Summary</h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              padding: "0 14px 12px",
            }}
          >
            <StatCard
              label="Total Collected"
              value={fmtMoney(dashStats.total)}
              color="green"
              sub={`${dayBookings.length} booking(s) · ${dashStats.bookedSlots} slot(s)`}
            />
            <StatCard
              label="Occupancy"
              value={`${dashStats.occ}%`}
              color="gray"
              progress={dashStats.occ}
            />
            <StatCard
              label="📱 GPay Today"
              value={fmtMoney(dashStats.gpay)}
              color="blue"
            />
            <StatCard
              label="💵 Cash Today"
              value={fmtMoney(dashStats.cash)}
              color="amber"
            />
            <StatCard
              label="🗓 Advance Today"
              value={fmtMoney(dashStats.adv)}
              color="purple"
            />
            <StatCard
              label="⏳ Pending Due"
              value={fmtMoney(dashStats.pending)}
              color="red"
            />
          </div>

          {/* Slots list */}
          <div
            style={{
              padding: "0 14px 6px",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <h2 style={{ fontSize: 14, fontWeight: 700 }}>Slots</h2>
            <span style={{ fontSize: 11, color: "#aaa" }}>
              {slots.length} total slots
            </span>
          </div>

          {dashLoading ? (
            <div
              style={{
                textAlign: "center",
                padding: 28,
                color: "#aaa",
                fontSize: 13,
              }}
            >
              ⏳ Loading from Sheets…
            </div>
          ) : (
            <SlotsList
              slots={slots}
              dayBookings={dayBookings}
              date={dashDate}
              onSlotClick={(date, b) => setDrawer(b)}
              onAvailClick={(date, label) => quickAdd(date, label)}
            />
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════
          ADD BOOKING PAGE
      ═══════════════════════════════════════ */}
      {page === "add" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            paddingBottom: 80,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              background: "#1a472a",
              color: "#fff",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 24 }}>➕</div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                New Booking
              </h1>
              <p style={{ fontSize: 11, opacity: 0.65, marginTop: 1 }}>
                {isWeekend(addDate) ? "Weekend" : "Weekday"} · ₹
                {getRateForDate(addDate, settings)}/hr
              </p>
            </div>
          </div>
          <div style={{ padding: "12px 14px", flex: 1 }}>
            <FieldGroup label="Date">
              <input
                type="date"
                className="field-input"
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
                style={inputStyle}
              />
            </FieldGroup>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 13,
              }}
            >
              <FieldGroup label="Start Time">
                <select
                  value={addSlot}
                  onChange={(e) => setAddSlot(e.target.value)}
                  style={inputStyle}
                >
                  {/* WHY .map()? Render array of <option> from slots array */}
                  {slots.map((s) => (
                    <option key={s.label} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="End Time">
                <select
                  value={addSlotEnd}
                  onChange={(e) => setAddSlotEnd(e.target.value)}
                  style={inputStyle}
                >
                  {slots.map((s) => (
                    <option key={s.label} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </FieldGroup>
            </div>

            {/* Duration info bar */}
            <div
              style={{
                background: "#e8f5e9",
                borderRadius: 10,
                padding: "10px 13px",
                marginBottom: 13,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: 12, color: "#1a6b38" }}>
                ⏱ {durationHrs.toFixed(1)} hrs × {fmtMoney(rate)}/hr
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#1a472a" }}>
                {fmtMoney(autoCalcAmount)}
              </div>
            </div>

            <FieldGroup label="Customer Name">
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Team / Customer name"
                style={inputStyle}
              />
            </FieldGroup>

            <FieldGroup label="Phone">
              <input
                type="tel"
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
                placeholder="9876543210"
                maxLength={10}
                style={inputStyle}
              />
            </FieldGroup>

            <FieldGroup label="Sport">
              <select
                value={addSport}
                onChange={(e) => setAddSport(e.target.value)}
                style={inputStyle}
              >
                {SPORTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </FieldGroup>

            <FieldGroup label="Total Amount ₹ (auto-calculated, can edit)">
              <input
                type="number"
                value={addAmount}
                onChange={(e) => setAddAmount(parseFloat(e.target.value) || 0)}
                style={inputStyle}
              />
            </FieldGroup>

            {/* Discount */}
            <div
              style={{
                background: "#fce4ec",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 13,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#c2185b",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                Discount (₹)
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <input
                  type="number"
                  value={addDiscount || ""}
                  onChange={(e) =>
                    setAddDiscount(parseFloat(e.target.value) || 0)
                  }
                  placeholder="0"
                  style={{ ...inputStyle, background: "#fff" }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "#888" }}>Final:</span>
                  <span
                    style={{ fontSize: 17, fontWeight: 800, color: "#1a472a" }}
                  >
                    {fmtMoney(finalAmount)}
                  </span>
                </div>
              </div>
              <input
                type="text"
                value={addDiscReason}
                onChange={(e) => setAddDiscReason(e.target.value)}
                placeholder="Reason for discount..."
                style={{
                  ...inputStyle,
                  fontSize: 12,
                  padding: "7px 10px",
                  marginTop: 4,
                  background: "#fff",
                }}
              />
            </div>

            {/* Payment fields */}
            <div
              style={{
                background: "#f8f8f8",
                borderRadius: 10,
                padding: 12,
                marginBottom: 13,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#888",
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                Payment Received
              </div>
              {[
                { label: "📱 GPay", val: addGpay, set: setAddGpay },
                { label: "💵 Cash", val: addCash, set: setAddCash },
              ].map(({ label, val, set }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: "#777",
                      fontWeight: 600,
                      minWidth: 58,
                    }}
                  >
                    {label}
                  </div>
                  <input
                    type="number"
                    value={val || ""}
                    onChange={(e) => set(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    style={{
                      flex: 1,
                      border: "1.5px solid #e0e0e0",
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontSize: 14,
                      background: "#fff",
                      outline: "none",
                    }}
                  />
                </div>
              ))}
              {/* Advance with mode selector */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#777",
                    fontWeight: 600,
                    minWidth: 58,
                  }}
                >
                  🗓 Advance
                </div>
                <input
                  type="number"
                  value={addAdvance || ""}
                  onChange={(e) =>
                    setAddAdvance(parseFloat(e.target.value) || 0)
                  }
                  placeholder="0"
                  style={{
                    flex: 1,
                    border: "1.5px solid #e0e0e0",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 14,
                    background: "#fff",
                    outline: "none",
                  }}
                />
                {/* Toggle buttons for advance mode */}
                {["gpay", "cash"].map((m) => (
                  <button
                    key={m}
                    onClick={() => setAddAdvMode(addAdvMode === m ? "" : m)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      border: `1.5px solid ${addAdvMode === m ? (m === "gpay" ? "#1565c0" : "#b45309") : "#e0e0e0"}`,
                      background:
                        addAdvMode === m
                          ? m === "gpay"
                            ? "#e3f2fd"
                            : "#fffde7"
                          : "#fafafa",
                      color:
                        addAdvMode === m
                          ? m === "gpay"
                            ? "#1565c0"
                            : "#b45309"
                          : "#999",
                    }}
                  >
                    {m === "gpay" ? "📱" : "💵"}
                  </button>
                ))}
              </div>
              {/* Payment summary row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: 8,
                  borderTop: "1px solid #eee",
                  marginTop: 4,
                }}
              >
                <div style={{ fontSize: 11, color: "#888" }}>
                  Total paid:{" "}
                  <span style={{ fontWeight: 700, color: "#1a472a" }}>
                    {fmtMoney(totalPaid)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#c0392b" }}>
                  Pending:{" "}
                  <span style={{ fontWeight: 700 }}>
                    {fmtMoney(pendingAmount)}
                  </span>
                </div>
              </div>
            </div>

            <FieldGroup label="Notes">
              <input
                type="text"
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                placeholder="Any notes..."
                style={inputStyle}
              />
            </FieldGroup>

            <button
              onClick={saveBooking}
              style={{
                width: "100%",
                padding: 14,
                background: "#1a472a",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
                marginTop: 4,
              }}
            >
              Save Booking
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          HISTORY PAGE
      ═══════════════════════════════════════ */}
      {page === "history" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            paddingBottom: 80,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              background: "#1a472a",
              color: "#fff",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 24 }}>📋</div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                History
              </h1>
              <p style={{ fontSize: 11, opacity: 0.65, marginTop: 1 }}>
                {histMonth}
              </p>
            </div>
          </div>

          <div style={{ padding: "10px 14px 4px" }}>
            <select
              value={histMonth}
              onChange={(e) => setHistMonth(e.target.value)}
              style={{ ...inputStyle, fontSize: 13 }}
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Filter chips */}
          <div
            style={{
              display: "flex",
              gap: 7,
              padding: "10px 14px",
              overflowX: "auto",
            }}
          >
            {["all", "GPay", "Cash", "Advance", "Mix", "pending"].map((f) => (
              <button
                key={f}
                onClick={() => setHistFilter(f)}
                style={{
                  border: `1.5px solid ${histFilter === f ? "#1a472a" : "#e0e0e0"}`,
                  borderRadius: 20,
                  padding: "5px 13px",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  background: histFilter === f ? "#1a472a" : "#fff",
                  color: histFilter === f ? "#fff" : "#666",
                  fontWeight: 600,
                }}
              >
                {f === "all" ? "All" : f === "pending" ? "⏳ Pending" : f}
              </button>
            ))}
          </div>

          {/* Weekly summary */}
          <WeeklySummary bookings={allHistBookings} />

          {/* ── PDF DOWNLOAD BUTTON ─────────────────────────────────────────
              WHERE: Between WeeklySummary and the booking list
              WHY HERE: User sees weekly totals above, then can download report,
                        then scroll through individual bookings below
              WHAT IT DOES:
                1. Filters allHistBookings to last 7 days
                2. Creates PDF with jsPDF
                3. Draws table with autoTable plugin
                4. Adds totals row at bottom
                5. Saves file as "Weekly_Report.pdf"
          ─────────────────────────────────────────────────────────────── */}
          <div style={{ padding: "0 14px 10px" }}>
            <button
              onClick={() => {
                // ── Step 1: Filter last 7 days ───────────────────────────
                const today = new Date();
                const weekData = allHistBookings.filter((b) => {
                  const bookingDate = new Date(b.date);
                  const diff = (today - bookingDate) / (1000 * 60 * 60 * 24);
                  return diff >= 0 && diff <= 7;
                });

                if (weekData.length === 0) {
                  alert("No bookings in the last 7 days to download.");
                  return;
                }

                // ── Step 2: Create PDF document ──────────────────────────
                const pdf = new jsPDF();
                const turfName = settings.turfName || "Turf Manager";

                // Title
                pdf.setFontSize(18);
                pdf.setTextColor(26, 71, 42); // #1a472a green
                pdf.text(`${turfName} — Weekly Report`, 14, 20);

                // Date range subtitle
                pdf.setFontSize(10);
                pdf.setTextColor(120, 120, 120);
                const fromDate = new Date(today);
                fromDate.setDate(today.getDate() - 7);
                pdf.text(
                  `${fromDate.toLocaleDateString("en-IN")} – ${today.toLocaleDateString("en-IN")}`,
                  14,
                  28,
                );

                // ── Step 3: Draw table using autoTable ───────────────────
                autoTable(pdf, {
                  startY: 34,
                  head: [
                    [
                      "Date",
                      "Slot",
                      "Customer",
                      "Sport",
                      "Final Amt",
                      "GPay",
                      "Cash",
                      "Advance",
                      "Pending",
                    ],
                  ],
                  body: weekData.map((b) => {
                    const fin =
                      parseFloat(b.finalAmount) || parseFloat(b.amount) || 0;
                    const gp = parseFloat(b.payGpay) || 0;
                    const ca = parseFloat(b.payCash) || 0;
                    const ad = parseFloat(b.payAdvance) || 0;
                    const due = Math.max(0, fin - (gp + ca + ad));
                    return [
                      b.date,
                      b.slotTime || "",
                      b.customerName || "",
                      b.sport || "",
                      `₹${Math.round(fin).toLocaleString("en-IN")}`,
                      gp > 0
                        ? `₹${Math.round(gp).toLocaleString("en-IN")}`
                        : "-",
                      ca > 0
                        ? `₹${Math.round(ca).toLocaleString("en-IN")}`
                        : "-",
                      ad > 0
                        ? `₹${Math.round(ad).toLocaleString("en-IN")}`
                        : "-",
                      due > 0
                        ? `₹${Math.round(due).toLocaleString("en-IN")}`
                        : "✓",
                    ];
                  }),
                  // Table styling
                  headStyles: {
                    fillColor: [26, 71, 42],
                    textColor: 255,
                    fontStyle: "bold",
                    fontSize: 8,
                  },
                  bodyStyles: { fontSize: 8 },
                  alternateRowStyles: { fillColor: [245, 250, 245] },
                  columnStyles: {
                    0: { cellWidth: 20 }, // Date
                    1: { cellWidth: 28 }, // Slot
                    2: { cellWidth: 28 }, // Customer
                    3: { cellWidth: 18 }, // Sport
                  },
                });

                // ── Step 4: Add totals below table ───────────────────────
                const totalGpay = weekData.reduce(
                  (s, b) => s + (parseFloat(b.payGpay) || 0),
                  0,
                );
                const totalCash = weekData.reduce(
                  (s, b) => s + (parseFloat(b.payCash) || 0),
                  0,
                );
                const totalAdv = weekData.reduce(
                  (s, b) => s + (parseFloat(b.payAdvance) || 0),
                  0,
                );
                const totalFin = weekData.reduce(
                  (s, b) =>
                    s +
                    (parseFloat(b.finalAmount) || parseFloat(b.amount) || 0),
                  0,
                );
                const totalPending = weekData.reduce((b, bk) => {
                  const fin =
                    parseFloat(bk.finalAmount) || parseFloat(bk.amount) || 0;
                  const paid =
                    (parseFloat(bk.payGpay) || 0) +
                    (parseFloat(bk.payCash) || 0) +
                    (parseFloat(bk.payAdvance) || 0);
                  return b + Math.max(0, fin - paid);
                }, 0);

                const y = pdf.lastAutoTable.finalY + 10;
                pdf.setFontSize(10);
                pdf.setTextColor(26, 71, 42);
                pdf.setFont(undefined, "bold");
                pdf.text("Weekly Totals", 14, y);
                pdf.setFont(undefined, "normal");
                pdf.setTextColor(50, 50, 50);
                pdf.text(`Total Bookings : ${weekData.length}`, 14, y + 7);
                pdf.text(
                  `Final Amount   : ₹${Math.round(totalFin).toLocaleString("en-IN")}`,
                  14,
                  y + 14,
                );
                pdf.text(
                  `📱 GPay        : ₹${Math.round(totalGpay).toLocaleString("en-IN")}`,
                  14,
                  y + 21,
                );
                pdf.text(
                  `💵 Cash        : ₹${Math.round(totalCash).toLocaleString("en-IN")}`,
                  14,
                  y + 28,
                );
                pdf.text(
                  `🗓 Advance     : ₹${Math.round(totalAdv).toLocaleString("en-IN")}`,
                  14,
                  y + 35,
                );
                if (totalPending > 0) {
                  pdf.setTextColor(192, 57, 43);
                  pdf.text(
                    `⏳ Pending Due  : ₹${Math.round(totalPending).toLocaleString("en-IN")}`,
                    14,
                    y + 42,
                  );
                }

                // ── Step 5: Save the file ────────────────────────────────
                const fileName = `${turfName.replace(/\s+/g, "_")}_Weekly_${today.toISOString().slice(0, 10)}.pdf`;
                pdf.save(fileName);
              }}
              style={{
                width: "100%",
                background: "#1a472a",
                color: "#fff",
                border: "none",
                padding: "11px 15px",
                borderRadius: 10,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              📄 Download Weekly PDF
            </button>
          </div>
          {/* ── END PDF DOWNLOAD BUTTON ──────────────────────────────── */}

          {/* List */}
          {histLoading ? (
            <div
              style={{
                textAlign: "center",
                padding: 28,
                color: "#aaa",
                fontSize: 13,
              }}
            >
              ⏳ Loading…
            </div>
          ) : filteredHistory.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#bbb" }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>📋</div>
              <p style={{ fontSize: 13 }}>No bookings found</p>
            </div>
          ) : (
            filteredHistory.map((b) => (
              <HistoryCard
                key={b.id}
                booking={b}
                onClick={() => setDrawer(b)}
              />
            ))
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════
          SETTINGS PAGE
      ═══════════════════════════════════════ */}
      {page === "settings" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            paddingBottom: 80,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              background: "#1a472a",
              color: "#fff",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 24 }}>⚙️</div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                Settings
              </h1>
              <p style={{ fontSize: 11, opacity: 0.65, marginTop: 1 }}>
                Turf configuration
              </p>
            </div>
          </div>
          <div style={{ padding: "12px 14px", flex: 1 }}>
            <div
              style={{
                background: "#fff",
                borderRadius: 13,
                overflow: "hidden",
                marginBottom: 10,
              }}
            >
              {[
                {
                  icon: "⚽",
                  bg: "#e8f5e9",
                  label: "Turf Name",
                  key: "turfName",
                  type: "text",
                  placeholder: "My Turf Arena",
                },
                {
                  icon: "💰",
                  bg: "#fff3e0",
                  label: "Weekday Rate (Mon–Fri) ₹",
                  key: "wdPrice",
                  type: "number",
                  placeholder: "800",
                },
                {
                  icon: "💰",
                  bg: "#fce4ec",
                  label: "Weekend Rate (Sat–Sun) ₹",
                  key: "wePrice",
                  type: "number",
                  placeholder: "1000",
                },
              ].map(({ icon, bg, label, key, type, placeholder }) => (
                <div
                  key={key}
                  style={{
                    padding: "13px 14px",
                    borderBottom: "1px solid #f5f5f5",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background: bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4
                      style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}
                    >
                      {label}
                    </h4>
                    <input
                      type={type}
                      value={settings[key] || ""}
                      placeholder={placeholder}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        border: "1.5px solid #e0e0e0",
                        borderRadius: 9,
                        padding: "9px 11px",
                        fontSize: 13,
                        marginTop: 7,
                        outline: "none",
                        background: "#fafafa",
                        color: "#1a1a1a",
                      }}
                    />
                  </div>
                </div>
              ))}
              <div
                style={{
                  padding: "13px 14px",
                  borderBottom: "1px solid #f5f5f5",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: "#e8f5e9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  🔗
                </div>
                <div style={{ flex: 1 }}>
                  <h4
                    style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}
                  >
                    Apps Script URL
                  </h4>
                  <p style={{ fontSize: 11, color: "#999" }}>
                    Paste your Google Apps Script deployment URL
                  </p>
                  <input
                    type="text"
                    value={settings.scriptUrl || ""}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        scriptUrl: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      border: "1.5px solid #e0e0e0",
                      borderRadius: 9,
                      padding: "9px 11px",
                      fontSize: 11,
                      marginTop: 7,
                      outline: "none",
                      background: "#fafafa",
                      color: "#1a1a1a",
                    }}
                  />
                </div>
              </div>
              <div style={{ padding: "13px 14px" }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 7 }}>
                  Slot Duration
                </h4>
                <select
                  value={settings.slotDur || "60"}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      slotDur: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    border: "1.5px solid #e0e0e0",
                    borderRadius: 9,
                    padding: "9px 11px",
                    fontSize: 13,
                    outline: "none",
                    background: "#fafafa",
                  }}
                >
                  <option value="60">1 hour</option>
                  <option value="30">30 minutes</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={testConn}
                style={{
                  background: "#fff",
                  color: "#1a472a",
                  border: "1.5px solid #1a472a",
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🔌 Test Google Sheets Connection
              </button>
              <button
                onClick={syncAll}
                style={{
                  background: "#1a472a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ↻ Sync All to Google Sheets
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          BOOKING DETAIL DRAWER
          WHY conditional render? Only show when drawer state has a booking
      ═══════════════════════════════════════ */}
      {drawer && (
        <BookingDrawer
          booking={drawer}
          onClose={() => setDrawer(null)}
          onDelete={deleteBooking}
          onCollect={(b) => {
            setMoreGpay(0);
            setMoreCash(0);
            setDrawer({ ...b, _collectMode: true });
          }}
          collectMode={drawer._collectMode}
          moreGpay={moreGpay}
          setMoreGpay={setMoreGpay}
          moreCash={moreCash}
          setMoreCash={setMoreCash}
          onSubmitMore={submitMorePayment}
        />
      )}

      {/* ═══════════════════════════════════════
          BOTTOM NAVIGATION
      ═══════════════════════════════════════ */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          borderTop: "1px solid #e0e0e0",
          display: "flex",
          zIndex: 100,
        }}
      >
        {[
          { id: "dashboard", icon: "▦", label: "Dashboard" },
          { id: "add", icon: "⊕", label: "New Booking" },
          { id: "history", icon: "≡", label: "History" },
          { id: "settings", icon: "⚙", label: "Settings" },
        ].map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => handleNav(id)}
            style={{
              flex: 1,
              padding: "10px 4px 8px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              border: "none",
              background: "none",
              cursor: "pointer",
              color: page === id ? "#1a472a" : "#999",
              fontSize: 10,
              fontWeight: page === id ? 700 : 400,
            }}
          >
            <span style={{ fontSize: 20 }}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Toast notification */}
      <Toast message={toast.msg} visible={toast.visible} />
    </div>
  );
}

// ── STEP 22: SLOTS LIST COMPONENT ────────────────────────────
// WHY separate component?
//   It's complex logic — isolating it keeps App component readable
//   Could be reused elsewhere if needed

function SlotsList({ slots, dayBookings, date, onSlotClick, onAvailClick }) {
  // Build a map: slotLabel → booking
  // WHY Map instead of object? Keys can be any type; preserves insertion order
  const bookedMap = {};
  dayBookings.forEach((b) => {
    if (b.isBlock && b.slotTimeEnd) {
      let marking = false;
      slots.forEach((sl) => {
        if (sl.label === b.slotTime) marking = true;
        if (marking) bookedMap[sl.label] = b;
        if (sl.label === b.slotTimeEnd) marking = false;
      });
    } else {
      bookedMap[b.slotTime] = b;
    }
  });

  const rendered = [];
  let skipUntil = null;

  slots.forEach((sl) => {
    if (skipUntil) {
      if (sl.label === skipUntil) skipUntil = null;
      return; // Skip this slot (it's part of a block booking)
    }
    const b = bookedMap[sl.label];
    if (b) {
      const mode = getPayMode(b);
      const borderColors = {
        Mix: "#1a472a",
        GPay: "#1565c0",
        Cash: "#b45309",
        Advance: "#5b21b6",
        Pending: "#e0e0e0",
      };
      const finalAmt = parseFloat(b.finalAmount) || parseFloat(b.amount) || 0;
      const paid =
        (parseFloat(b.payGpay) || 0) +
        (parseFloat(b.payCash) || 0) +
        (parseFloat(b.payAdvance) || 0);
      const pending = Math.max(0, finalAmt - paid);
      const disc = parseFloat(b.discount) || 0;
      if (b.isBlock && b.slotTimeEnd) skipUntil = b.slotTimeEnd;

      rendered.push(
        <div
          key={b.id}
          onClick={() => onSlotClick(date, b)}
          style={{
            background: "#fff",
            borderRadius: 12,
            marginBottom: 7,
            overflow: "hidden",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            cursor: "pointer",
            borderLeft: `4px solid ${borderColors[mode] || "#e0e0e0"}`,
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              gap: 9,
            }}
          >
            <div style={{ minWidth: 72 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#555" }}>
                {sl.label.split("–")[0].trim()}
              </div>
              <div style={{ fontSize: 9, color: "#bbb", marginTop: 1 }}>
                {sl.label.split("–")[1]?.trim()}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#1a1a1a",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {b.customerName}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#999",
                  marginTop: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  flexWrap: "wrap",
                }}
              >
                {b.sport}&nbsp;<Badge type={mode.toLowerCase()}>{mode}</Badge>
                {disc > 0 && <Badge type="disc">-₹{disc}</Badge>}
                {b.isBlock && <Badge type="block">Block</Badge>}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#1a472a" }}>
                {fmtMoney(finalAmt)}
              </div>
              {pending > 0 && (
                <div style={{ fontSize: 9, color: "#c0392b", fontWeight: 600 }}>
                  Due: {fmtMoney(pending)}
                </div>
              )}
            </div>
          </div>
        </div>,
      );
    } else {
      rendered.push(
        <div
          key={sl.label}
          onClick={() => onAvailClick(date, sl.label)}
          style={{
            background: "#fff",
            borderRadius: 12,
            marginBottom: 7,
            overflow: "hidden",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            cursor: "pointer",
            borderLeft: "4px solid #e8e8e8",
            opacity: 0.7,
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              gap: 9,
            }}
          >
            <div style={{ minWidth: 72 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#555" }}>
                {sl.label.split("–")[0].trim()}
              </div>
              <div style={{ fontSize: 9, color: "#bbb", marginTop: 1 }}>
                {sl.label.split("–")[1]?.trim()}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#ccc", flex: 1 }}>
              Available — tap to book
            </div>
            <div style={{ color: "#ddd", fontSize: 20 }}>+</div>
          </div>
        </div>,
      );
    }
  });

  return <div style={{ padding: "0 14px 8px" }}>{rendered}</div>;
}

// ── STEP 23: HISTORY CARD COMPONENT ──────────────────────────
function HistoryCard({ booking: b, onClick }) {
  const mode = getPayMode(b);
  const dotColors = {
    Mix: "#1a472a",
    GPay: "#1565c0",
    Cash: "#b45309",
    Advance: "#5b21b6",
    Pending: "#ccc",
  };
  const fin = parseFloat(b.finalAmount) || parseFloat(b.amount) || 0;
  const g = parseFloat(b.payGpay) || 0;
  const c = parseFloat(b.payCash) || 0;
  const a = parseFloat(b.payAdvance) || 0;
  const pend = Math.max(0, fin - (g + c + a));
  const d = new Date(b.date + "T00:00:00");
  const dStr = d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        margin: "0 14px 7px",
        borderRadius: 12,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: dotColors[mode] || "#ccc",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {b.customerName}
        </div>
        <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
          {dStr} · {b.slotTime} · {b.sport}
        </div>
        <div
          style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}
        >
          {g > 0 && (
            <span
              style={{
                background: "#e3f2fd",
                color: "#1565c0",
                padding: "2px 7px",
                borderRadius: 5,
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              📱 {fmtMoney(g)}
            </span>
          )}
          {c > 0 && (
            <span
              style={{
                background: "#fffde7",
                color: "#b45309",
                padding: "2px 7px",
                borderRadius: 5,
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              💵 {fmtMoney(c)}
            </span>
          )}
          {a > 0 && (
            <span
              style={{
                background: "#ede7f6",
                color: "#5b21b6",
                padding: "2px 7px",
                borderRadius: 5,
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              🗓 {fmtMoney(a)}
            </span>
          )}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#1a472a" }}>
          {fmtMoney(fin)}
        </div>
        {pend > 0 && (
          <div style={{ fontSize: 10, color: "#c0392b", fontWeight: 600 }}>
            Due {fmtMoney(pend)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── STEP 24: WEEKLY SUMMARY COMPONENT ────────────────────────
function WeeklySummary({ bookings: bList }) {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  let wGpay = 0,
    wCash = 0,
    wAdv = 0;
  bList.forEach((b) => {
    if (!b.date) return;
    const d = new Date(b.date + "T00:00:00");
    if (d >= monday && d <= sunday) {
      wGpay += parseFloat(b.payGpay) || 0;
      wCash += parseFloat(b.payCash) || 0;
      wAdv += parseFloat(b.payAdvance) || 0;
    }
  });

  const monStr = monday.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  const sunStr = sunday.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

  return (
    <div
      style={{
        margin: "4px 14px 8px",
        background: "#fff",
        borderRadius: 13,
        padding: "13px 14px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 10,
        }}
      >
        📅 This Week's Collections
      </div>
      <div style={{ fontSize: 10, color: "#bbb", marginBottom: 8 }}>
        {monStr} – {sunStr}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { label: "📱 GPay", val: wGpay, bg: "#e3f2fd", color: "#1565c0" },
          { label: "💵 Cash", val: wCash, bg: "#fffde7", color: "#b45309" },
          { label: "🗓 Advance", val: wAdv, bg: "#ede7f6", color: "#5b21b6" },
        ].map(({ label, val, bg, color }) => (
          <div
            key={label}
            style={{
              flex: 1,
              background: bg,
              borderRadius: 10,
              padding: 10,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 3 }}>
              {fmtMoney(val)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── STEP 25: BOOKING DETAIL DRAWER COMPONENT ─────────────────
function BookingDrawer({
  booking: b,
  onClose,
  onDelete,
  onCollect,
  collectMode,
  moreGpay,
  setMoreGpay,
  moreCash,
  setMoreCash,
  onSubmitMore,
}) {
  const finalAmt = parseFloat(b.finalAmount) || parseFloat(b.amount) || 0;
  const g = parseFloat(b.payGpay) || 0;
  const c = parseFloat(b.payCash) || 0;
  const a = parseFloat(b.payAdvance) || 0;
  const paid = g + c + a;
  const pending = Math.max(0, finalAmt - paid);

  return (
    // Overlay backdrop: clicking outside closes drawer
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 200,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "20px 20px 0 0",
          width: "100%",
          maxWidth: 480,
          maxHeight: "94vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            background: "#ddd",
            borderRadius: 2,
            margin: "10px auto 0",
          }}
        />
        <div
          style={{
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #f0f0f0",
            position: "sticky",
            top: 0,
            background: "#fff",
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            {collectMode ? "Collect Payment" : b.slotTime}
          </h3>
          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "#f5f5f5",
              border: "none",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#888",
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: "14px 18px" }}>
          {collectMode ? (
            <>
              <div
                style={{
                  background: "#fff3cd",
                  borderRadius: 10,
                  padding: "10px 12px",
                  marginBottom: 14,
                  fontSize: 13,
                  color: "#856404",
                }}
              >
                Pending: <strong>{fmtMoney(pending)}</strong> from{" "}
                {b.customerName}
              </div>
              <div
                style={{
                  background: "#f8f8f8",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 13,
                }}
              >
                {[
                  { label: "📱 GPay", val: moreGpay, set: setMoreGpay },
                  { label: "💵 Cash", val: moreCash, set: setMoreCash },
                ].map(({ label, val, set }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: "#777",
                        fontWeight: 600,
                        minWidth: 58,
                      }}
                    >
                      {label}
                    </div>
                    <input
                      type="number"
                      value={val || ""}
                      onChange={(e) => set(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      style={{
                        flex: 1,
                        border: "1.5px solid #e0e0e0",
                        borderRadius: 8,
                        padding: "8px 10px",
                        fontSize: 14,
                        background: "#fff",
                        outline: "none",
                      }}
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={() => onSubmitMore(b)}
                style={{
                  width: "100%",
                  padding: 14,
                  background: "#1a472a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ✅ Add Payment
              </button>
            </>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    background: "#e8f5e9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                  }}
                >
                  👤
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>
                    {b.customerName}
                  </div>
                  <div style={{ fontSize: 12, color: "#999" }}>
                    {b.phone || "No phone"} · {b.sport}
                  </div>
                </div>
              </div>
              {/* Payment pills */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {[
                  { label: "GPay", val: g, bg: "#e3f2fd", color: "#1565c0" },
                  { label: "Cash", val: c, bg: "#fffde7", color: "#b45309" },
                  { label: "Advance", val: a, bg: "#ede7f6", color: "#5b21b6" },
                ].map(({ label, val, bg, color }) => (
                  <div
                    key={label}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      padding: 8,
                      textAlign: "center",
                      background: bg,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        color,
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        marginTop: 2,
                        color,
                      }}
                    >
                      {fmtMoney(val)}
                    </div>
                  </div>
                ))}
              </div>
              {/* Detail rows */}
              <div
                style={{
                  background: "#f8f8f8",
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 14,
                }}
              >
                {[
                  [
                    "Date",
                    new Date(b.date + "T00:00:00").toLocaleDateString("en-IN", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }),
                    "",
                  ],
                  ["Slot", b.slotTime, ""],
                  ["Original Amount", fmtMoney(b.amount), ""],
                  ...(b.discount > 0
                    ? [["Discount", `-${fmtMoney(b.discount)}`, "red"]]
                    : []),
                  ["Final Amount", fmtMoney(finalAmt), "green"],
                  ["Total Paid", fmtMoney(paid), "blue"],
                  ...(pending > 0
                    ? [["Balance Due", fmtMoney(pending), "red"]]
                    : []),
                  ...(b.notes ? [["Notes", b.notes, ""]] : []),
                ].map(([lbl, val, color]) => (
                  <div
                    key={lbl}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 9,
                    }}
                  >
                    <div
                      style={{ fontSize: 12, color: "#888", fontWeight: 500 }}
                    >
                      {lbl}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color:
                          color === "green"
                            ? "#1a6b38"
                            : color === "red"
                              ? "#c0392b"
                              : color === "blue"
                                ? "#1565c0"
                                : "#1a1a1a",
                        textAlign: "right",
                      }}
                    >
                      {val}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => onCollect(b)}
                style={{
                  width: "100%",
                  padding: 14,
                  background: "#1a472a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                  marginBottom: 8,
                }}
              >
                💰 Collect More Payment
              </button>
              <button
                onClick={() => onDelete(b)}
                style={{
                  width: "100%",
                  padding: 12,
                  background: "#fff",
                  color: "#c0392b",
                  border: "1.5px solid #eee",
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🗑 Cancel Booking
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── STEP 26: HELPER COMPONENTS ───────────────────────────────
// Small wrapper to reduce repetition in form fields
function FieldGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#888",
          marginBottom: 5,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// Shared input style object — defined outside render to avoid recreation
// WHY const outside? Style objects are recreated on every render if inside JSX
const inputStyle = {
  width: "100%",
  border: "1.5px solid #e5e5e5",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 15,
  color: "#1a1a1a",
  background: "#fafafa",
  outline: "none",
};

// ============================================================
// 📚 WHAT'S NEXT — Your Google Apps Script Code
// ============================================================
// You need to create a Google Apps Script that handles these actions:
//   - action=ping         → return { status: "ok", message: "Connected!" }
//   - action=getBookings  → return all bookings for a date or month
//   - action=addBooking   → add a row to the sheet
//
// HOW TO SET UP:
//   1. Open Google Sheets → Extensions → Apps Script
//   2. Paste the Apps Script code (see companion guide)
//   3. Deploy → New Deployment → Web App
//      - Execute as: Me
//      - Who has access: Anyone
//   4. Copy the /exec URL → paste in Settings tab of this app
// ============================================================
