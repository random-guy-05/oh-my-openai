const connectionPill = document.querySelector("#connection-pill");
const dashboardValue = document.querySelector("#dashboard-value");
const opencodexValue = document.querySelector("#opencodex-value");
const opencodexDetail = document.querySelector("#opencodex-detail");
const bridgeValue = document.querySelector("#bridge-value");
const bridgeDetail = document.querySelector("#bridge-detail");
const configValue = document.querySelector("#config-value");
const lastUpdated = document.querySelector("#last-updated");
const doctorOutput = document.querySelector("#doctor-output");
const connectButton = document.querySelector("#connect-button");
const connectionMessage = document.querySelector("#connection-message");

function setPill(state, label) {
  connectionPill.className = `status-pill ${state}`;
  connectionPill.querySelector("span:last-child").textContent = label;
}

function formatTime() {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date());
}

async function refreshStatus() {
  setPill("checking", "Checking services");
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    const data = await response.json();
    const running = data.bridge.running;
    const account = data.account || {};
    const accountReady = account.status === "ok";
    const opencodexRunning = data.opencodex?.running === true;
    const connection = data.connection || {};
    const webReady = connection.state === "ready";
    dashboardValue.textContent = "Online";
    dashboardValue.className = "metric-value good";
    opencodexValue.textContent = opencodexRunning ? "Running" : "Not running";
    opencodexValue.className = `metric-value ${opencodexRunning ? "good" : "warn"}`;
    opencodexDetail.textContent = opencodexRunning ? `127.0.0.1:${data.opencodex.port}` : "OpenCodex service unavailable";
    bridgeValue.textContent = running ? "Running" : "Not running";
    bridgeValue.className = `metric-value ${running ? "good" : "warn"}`;
    bridgeDetail.textContent = running ? `127.0.0.1:${data.bridge.health.port || 17841}` : "Open setup or run doctor";
    configValue.textContent = data.bridge.configured ? "Ready" : "Needs setup";
    configValue.className = `metric-value ${data.bridge.configured ? "good" : "warn"}`;
    lastUpdated.textContent = `Updated ${formatTime()}`;
    if (connection.running || connection.state === "starting" || connection.state === "running") {
      setPill("checking", "Connecting ChatGPT");
      connectionMessage.textContent = "A private ChatGPT sign-in window is open. Sign in there; it will close automatically when the composer is ready.";
      connectButton.disabled = true;
      connectButton.innerHTML = "Connecting… <span>•</span>";
    } else if (connection.state === "failed") {
      setPill("warn", "ChatGPT Web needs attention");
      const detail = connection.output?.split("\n").filter(Boolean).at(-2) || "The ChatGPT Web browser session is not connected.";
      connectionMessage.textContent = `${detail} Use Connect ChatGPT to try again.`;
      connectButton.disabled = false;
      connectButton.innerHTML = "Connect ChatGPT <span>↗</span>";
    } else if (running && accountReady && webReady) {
      setPill("connected", "ChatGPT connected");
      connectionMessage.textContent = `ChatGPT Web is connected and account access is verified (${account.modelCount} models available).`;
      connectButton.disabled = false;
      connectButton.innerHTML = "Reconnect ChatGPT <span>↗</span>";
    } else if (running && !accountReady) {
      setPill("warn", "Account not connected");
      connectionMessage.textContent = account.message || "The local bridge is running, but Codex account access has not been verified.";
      connectButton.disabled = false;
      connectButton.innerHTML = "Connect ChatGPT <span>↗</span>";
    } else if (running && accountReady) {
      setPill("warn", "ChatGPT Web sign-in needed");
      connectionMessage.textContent = "The Codex account is available, but the ChatGPT Web browser session still needs to be signed in once.";
      connectButton.disabled = false;
      connectButton.innerHTML = "Connect ChatGPT <span>↗</span>";
    } else {
      setPill("warn", "Setup required");
      connectionMessage.textContent = "Choose Connect ChatGPT to open a private sign-in window. The app will verify the composer and finish setup automatically.";
      connectButton.disabled = false;
      connectButton.innerHTML = "Connect ChatGPT <span>↗</span>";
    }
  } catch (error) {
    dashboardValue.textContent = "Unavailable";
    bridgeValue.textContent = "Unavailable";
    opencodexValue.textContent = "Unavailable";
    configValue.textContent = "Unknown";
    setPill("warn", "Dashboard error");
    lastUpdated.textContent = error.message;
  }
}

async function connectChatGPT() {
  connectButton.disabled = true;
  connectButton.innerHTML = "Starting connection… <span>•</span>";
  connectionMessage.textContent = "Starting the secure ChatGPT sign-in flow…";
  try {
    await fetch("/api/connect", { method: "POST", cache: "no-store" });
  } catch (error) {
    connectionMessage.textContent = `Connection could not start: ${error.message}`;
    connectButton.disabled = false;
  }
  await refreshStatus();
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
connectButton.addEventListener("click", connectChatGPT);
refreshStatus();
