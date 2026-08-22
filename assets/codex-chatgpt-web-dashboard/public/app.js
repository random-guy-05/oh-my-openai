const connectionPill = document.querySelector("#connection-pill");
const dashboardValue = document.querySelector("#dashboard-value");
const bridgeValue = document.querySelector("#bridge-value");
const bridgeDetail = document.querySelector("#bridge-detail");
const configValue = document.querySelector("#config-value");
const lastUpdated = document.querySelector("#last-updated");
const doctorOutput = document.querySelector("#doctor-output");

function setPill(state, label) {
  connectionPill.className = `status-pill ${state}`;
  connectionPill.querySelector("span:last-child").textContent = label;
}

function formatTime() {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date());
}

async function refreshStatus() {
  setPill("checking", "Checking bridge");
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    const data = await response.json();
    const running = data.bridge.running;
    dashboardValue.textContent = "Online";
    dashboardValue.className = "metric-value good";
    bridgeValue.textContent = running ? "Running" : "Not running";
    bridgeValue.className = `metric-value ${running ? "good" : "warn"}`;
    bridgeDetail.textContent = running ? `127.0.0.1:${data.bridge.health.port || 17841}` : "Open setup or run doctor";
    configValue.textContent = data.bridge.configured ? "Ready" : "Needs setup";
    configValue.className = `metric-value ${data.bridge.configured ? "good" : "warn"}`;
    lastUpdated.textContent = `Updated ${formatTime()}`;
    setPill(running ? "connected" : "warn", running ? "Bridge connected" : "Setup required");
  } catch (error) {
    dashboardValue.textContent = "Unavailable";
    bridgeValue.textContent = "Unavailable";
    configValue.textContent = "Unknown";
    setPill("warn", "Dashboard error");
    lastUpdated.textContent = error.message;
  }
}

async function runDoctor() {
  doctorOutput.textContent = "Running bridge doctor…";
  try {
    const response = await fetch("/api/doctor", { cache: "no-store" });
    const data = await response.json();
    doctorOutput.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    doctorOutput.textContent = `Doctor failed: ${error.message}`;
  }
}

document.querySelector("#refresh-button").addEventListener("click", refreshStatus);
document.querySelector("#doctor-button").addEventListener("click", runDoctor);
refreshStatus();
