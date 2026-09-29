// ---------- Configuration ----------
const API_BASE_URL = "http://127.0.0.1:8000";

// Numeric fields and the ranges FastAPI enforces (same as the Pydantic model)
const NUMERIC_RULES = {
  age:                     { label: "Age",                     min: 5, max: 100, integer: true },
  avg_daily_usage_hours:   { label: "Average daily usage",     min: 0, max: 24 },
  daily_unlocks:           { label: "Daily unlocks",           min: 0, integer: true },
  study_hours:             { label: "Study hours",             min: 0, max: 24 },
  physical_activity_hours: { label: "Physical activity hours", min: 0, max: 24 },
  sleep_hours_per_night:   { label: "Sleep hours per night",   min: 0, max: 24 },
};
const TEXT_FIELDS = [
  "gender", "country", "academic_level",
  "most_used_platform", "purpose_of_use", "stress_level",
];

// ---------- DOM references ----------
const form = document.getElementById("predictionForm");
const predictBtn = document.getElementById("predictBtn");
const resultCard = document.getElementById("resultCard");
const scoreNumber = document.getElementById("scoreNumber");
const meterValue = document.getElementById("meterValue");
const resultNote = document.getElementById("resultNote");
const errorBox = document.getElementById("errorBox");
const errorTitle = document.getElementById("errorTitle");
const errorMessage = document.getElementById("errorMessage");
const errorList = document.getElementById("errorList");
const apiStatus = document.getElementById("apiStatus");
const apiStatusText = document.getElementById("apiStatusText");

const RING_LENGTH = 326.73;      // circumference of the SVG circle (2 * PI * 52)
const METER_MAX = 100;           // visual scale only, NOT a medical range

// ---------- API status ----------
async function checkAPIStatus() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${API_BASE_URL}/`, { signal: controller.signal });
    setStatus(response.ok);
  } catch {
    setStatus(false);
  } finally {
    clearTimeout(timer);
  }
}

function setStatus(online) {
  apiStatus.className = `status ${online ? "status--online" : "status--offline"}`;
  apiStatusText.textContent = online ? "🟢 API Online" : "🔴 API Offline";
}

// ---------- Form handling ----------
async function handlePrediction(event) {
  event.preventDefault();
  hideError();
  clearInvalidMarks();

  const problems = validateForm();
  if (problems.length > 0) {
    showError("Please check your input values.", null, problems);
    return;
  }

  const payload = buildPayload();
  setLoadingState(true);

  try {
    const response = await fetch(`${API_BASE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json();
      displayPrediction(data.predicted_mental_health_score);
    } else if (response.status === 422) {
      const data = await response.json();
      showError("Please check your input values.", null, parseValidationErrors(data));
    } else {
      showError(`The server returned an error (status ${response.status}).`,
                "Something went wrong while generating the prediction. Please try again.");
    }
  } catch (error) {
    // fetch() only throws when the request could not reach the server
    showError("Connection problem",
              "Unable to connect to the FastAPI server. Please make sure the backend is running on port 8000.");
    setStatus(false);
  } finally {
    setLoadingState(false);
  }
}

function buildPayload() {
  const payload = {};
  for (const name of TEXT_FIELDS) {
    payload[name] = form.elements[name].value;
  }
  for (const name of Object.keys(NUMERIC_RULES)) {
    payload[name] = Number(form.elements[name].value);   // string -> number
  }
  return payload;   // note: no Group_Country, the backend adds it
}

function validateForm() {
  const problems = [];

  for (const name of TEXT_FIELDS) {
    if (!form.elements[name].value) {
      problems.push(`${labelFor(name)}: please select an option.`);
      markInvalid(name);
    }
  }

  for (const [name, rule] of Object.entries(NUMERIC_RULES)) {
    const raw = form.elements[name].value.trim();
    const value = Number(raw);
    let message = null;

    if (raw === "" || Number.isNaN(value)) message = "please enter a number.";
    else if (rule.integer && !Number.isInteger(value)) message = "must be a whole number.";
    else if (value < rule.min) message = `must be at least ${rule.min}.`;
    else if (rule.max !== undefined && value > rule.max) message = `must be at most ${rule.max}.`;

    if (message) {
      problems.push(`${rule.label}: ${message}`);
      markInvalid(name);
    }
  }
  return problems;
}

// ---------- Result display ----------
function displayPrediction(score) {
  animateNumber(score);

  const fraction = Math.min(Math.max(score / METER_MAX, 0), 1);
  meterValue.style.strokeDashoffset = RING_LENGTH * (1 - fraction);

  resultNote.textContent = "Generated by the machine-learning model via the FastAPI backend.";

  resultCard.classList.remove("pop");
  void resultCard.offsetWidth;          // restart the CSS animation
  resultCard.classList.add("pop");
}

function animateNumber(target) {
  const duration = 1000;
  const start = performance.now();

  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    scoreNumber.textContent = (target * eased).toFixed(2);
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------- Loading state ----------
function setLoadingState(isLoading) {
  predictBtn.disabled = isLoading;
  predictBtn.textContent = isLoading ? "⏳ Predicting..." : "Predict Mental Health Score";
}

// ---------- Errors ----------
function showError(title, message, details = []) {
  errorTitle.textContent = title;
  errorMessage.textContent = message || "";
  errorMessage.hidden = !message;
  errorList.innerHTML = "";
  for (const detail of details) {
    const li = document.createElement("li");
    li.textContent = detail;
    errorList.appendChild(li);
  }
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
}

// FastAPI 422 looks like: { detail: [ { loc: ["body","age"], msg: "..." }, ... ] }
function parseValidationErrors(data) {
  if (!data || !Array.isArray(data.detail)) return [];
  return data.detail.map((item) => {
    const fieldName = item.loc[item.loc.length - 1];
    markInvalid(fieldName);
    return `${labelFor(fieldName)}: ${item.msg}`;
  });
}

// ---------- Small helpers ----------
function labelFor(name) {
  const label = document.querySelector(`label[for="${name}"]`);
  return label ? label.textContent : name;
}

function markInvalid(name) {
  const input = form.elements[name];
  if (input) input.closest(".field").classList.add("field--invalid");
}

function clearInvalidMarks() {
  form.querySelectorAll(".field--invalid").forEach((el) => el.classList.remove("field--invalid"));
}

// ---------- Start-up ----------
form.addEventListener("submit", handlePrediction);
document.getElementById("errorClose").addEventListener("click", hideError);
document.getElementById("year").textContent = new Date().getFullYear();

checkAPIStatus();
setInterval(checkAPIStatus, 15000);   // re-check every 15 seconds
