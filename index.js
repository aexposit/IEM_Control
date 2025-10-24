if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").then(
      (registration) => {
        console.log("Service Worker registered:", registration.scope);
      },
      (err) => console.log("Service Worker registration failed:", err)
    );
  });
}


// --- JS per log dialog ---
const logDialog = document.getElementById('log-dialog');
const logContainer = document.getElementById('log-container');
const openLogBtn = document.getElementById('open-log-btn');
const closeLogBtn = document.getElementById('close-log-btn');

openLogBtn.addEventListener('click', () => logDialog.showModal());
closeLogBtn.addEventListener('click', () => logDialog.close());

// Funzione per aggiungere messaggi al log
function addLog(message, state = '') {
  const p = document.createElement('p');
  p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  if (state) p.className = `log-${state}`;
  logContainer.appendChild(p);
  logContainer.scrollTop = logContainer.scrollHeight; // scroll automatico in basso
}
//////////////////////////////////////////////////////////////////////////
////// BEGIN HACK PER MONITORARE WEBSOCKET
//////////////////////////////////////////////////////////////////////////
// --- Proxy WebSocket per log ---
const OriginalWebSocket = WebSocket;

class ProxyWebSocket extends OriginalWebSocket {
  constructor(url, protocols) {
    super(url, protocols);

    addLog(`WebSocket creato per: ${url}`, 'CONNECTING');
    this._logState();

    this.addEventListener('open', () => {
      this._logState();
      addLog('Connessione aperta', 'OPEN');
    });

    this.addEventListener('close', (e) => {
      this._logState();
      addLog(`Connessione chiusa (code: ${e.code})`, 'CLOSED');
    });

    this.addEventListener('error', (e) => {
      this._logState();
      addLog('Errore WebSocket', 'ERROR');
    });

    this.addEventListener('message', (msg) => {
      addLog(`Messaggio ricevuto: ${msg.data}`);
    });
  }

  _logState() {
    const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
    const state = states[this.readyState];
    addLog(`Stato corrente: ${state}`, state);
  }
}

window.WebSocket = ProxyWebSocket;
//////////////////////////////////////////////////////////////////////////
////// END HACK PER MONITORARE WEBSOCKET
//////////////////////////////////////////////////////////////////////////


import { SoundcraftUI, ConnectionStatus} from "./soundcraft-ui.bundle.js";

// --- GESTIONE IP MIXER CON LOCAL STORAGE ---
const ipInput = document.getElementById("mixer-ip");

// Recupera IP salvato o imposta default
const savedIP = localStorage.getItem("mixerIP") || "10.10.10.1";
localStorage.setItem("mixerIP", savedIP);
ipInput.value = savedIP;

// Quando cambia il valore, salva su localStorage
ipInput.addEventListener("change", () => {
  const newIP = ipInput.value.trim();
  if (newIP) {
    localStorage.setItem("mixerIP", newIP);

    console.log("IP salvato:", newIP);
        location.reload();
  }
});

const conn = new SoundcraftUI({
  targetIP: savedIP,
  webSocketCtor: WebSocket, //USERA IL PROXY HACK
});


const { BehaviorSubject } = rxjs;
const { distinctUntilChanged, auditTime } = rxjs.operators;

// store AUX selezionato
const selectedAux$ = new BehaviorSubject(1);

// container e header title
const auxContainer = document.getElementById("aux-container");
const auxSelector = document.getElementById("aux-selector");
const headerTitle = document.getElementById("header-title");

// BUTTON CONFIG & DIALOG
const configBtn = document.getElementById("config-btn");
const auxDialog = document.getElementById("aux-dialog");
const closeDialogBtn = document.getElementById("close-dialog-btn");

// sposta il container AUX selector nel dialog
const auxSelectorDialog = document.getElementById("aux-selector-dialog");
auxSelectorDialog.appendChild(auxSelector);

// nascondi dialog all’avvio
auxDialog.close();
const main = document.querySelector("main");
// apre il dialog
configBtn.addEventListener("click", () => {
  auxDialog.showModal();
  ipInput.blur();
  main.classList.add("main-dimmed"); // applica dimmed
});

// chiudi dialog
closeDialogBtn.addEventListener("click", () => {
  auxDialog.close();
  main.classList.remove("main-dimmed"); // rimuove dimmed
});

// CREA RADIO AUX
for (let aux = 1; aux <= 10; aux++) {
  const div = document.createElement("div");
  div.className = "aux-radio";

  const input = document.createElement("input");
  input.type = "radio";
  input.name = "aux";
  input.id = `aux-${aux}`;
  input.value = aux;
  if (aux === 1) input.checked = true;

  const label = document.createElement("label");
  label.htmlFor = `aux-${aux}`;
  label.id = `label-aux-${aux}`;
  label.textContent = `AUX ${aux}`;

  input.addEventListener("change", () => {
    if (input.checked) selectedAux$.next(aux);
  });

  div.appendChild(input);
  div.appendChild(label);
  auxSelector.appendChild(div);
}

// CREA GRUPPI AUX
for (let aux = 1; aux <= 10; aux++) {
  const group = document.createElement("div");
  group.className = "aux-group";
  group.id = `aux-${aux}-group`;

  for (let ch = 1; ch <= 24; ch++) {
    const row = document.createElement("div");
    row.className = "fader-row";

    const nameEl = document.createElement("div");
    nameEl.className = "fader-name";
    nameEl.textContent = "ANDREA";
    row.appendChild(nameEl);

    const controls = document.createElement("div");
    controls.className = "fader-controls";

    const decBtn = document.createElement("button");
    decBtn.textContent = "–";
    decBtn.className = "fader-btn";

    const valEl = document.createElement("span");
    valEl.className = "fader-value";
    valEl.textContent = "0.00";

    const incBtn = document.createElement("button");
    incBtn.textContent = "+";
    incBtn.className = "fader-btn";

    controls.appendChild(decBtn);
    controls.appendChild(valEl);
    controls.appendChild(incBtn);
    row.appendChild(controls);
    group.appendChild(row);

    // EVENTI BOTTONI
    decBtn.addEventListener("click", () => {
      const current = Math.max(parseFloat(valEl.textContent) - 0.05, 0);
      conn.aux(aux).input(ch).setFaderLevel(current);
    });

    incBtn.addEventListener("click", () => {
      const current = Math.min(parseFloat(valEl.textContent) + 0.05, 1);
      conn.aux(aux).input(ch).setFaderLevel(current);
    });

    // SUBSCRIBE NOME CANALE
    conn.master.input(ch).name$.subscribe((name) => {
      nameEl.textContent = name;
    });

    // SUBSCRIBE FADER LEVEL
    conn
      .aux(aux)
      .input(ch)
      .faderLevel$.pipe(distinctUntilChanged(), auditTime(32))
      .subscribe((level) => {
        valEl.textContent = level.toFixed(2);
      });
  }

  auxContainer.appendChild(group);

  // SUBSCRIBE NOME AUX → aggiorna anche header se selezionato
  conn.master.aux(aux).name$.subscribe((auxName) => {
    const radioLabel = document.getElementById(`label-aux-${aux}`);
    if (radioLabel) radioLabel.textContent = auxName;

    if (selectedAux$.getValue() === aux) {
      headerTitle.textContent = auxName;
    }
  });
}

// --- LOGICA PA TOGGLE ---
let PA = Array(24).fill(0); // array valori master
let paActive = false;
const paBtn = document.getElementById("pa-btn");

// salva valori master in tempo reale
for (let i = 1; i <= 24; i++) {
  conn.master
    .input(i)
    .faderLevel$.pipe(distinctUntilChanged(), auditTime(32))
    .subscribe((level) => {
      PA[i - 1] = level;
      localStorage.setItem("PA", JSON.stringify(PA));
    });
}

paBtn.addEventListener("click", () => {
  const aux = selectedAux$.getValue(); // AUX selezionato
  const auxGroup = document.getElementById(`aux-${aux}-group`);

  if (!paActive) {
    // Attivo PA: salva valori correnti dell'AUX
    const currentValues = [];
    for (let ch = 1; ch <= 24; ch++) {
      const valEl = auxGroup.querySelector(
        `.fader-row:nth-child(${ch}) .fader-value`
      );
      const val = parseFloat(valEl.textContent);
      currentValues.push(val);
    }
    localStorage.setItem(`AUX_backup_${aux}`, JSON.stringify(currentValues));

    // Imposta fader AUX con valori PA
    for (let ch = 1; ch <= 24; ch++) {
      conn
        .aux(aux)
        .input(ch)
        .setFaderLevel(PA[ch - 1]);
      auxGroup.querySelector(
        `.fader-row:nth-child(${ch}) .fader-value`
      ).textContent = PA[ch - 1].toFixed(2);
    }

    paActive = true;
    paBtn.style.background = "#00ffc8";
    paBtn.style.color = "#0f0f0f";
    auxGroup.classList.add("aux-dimmed");
    configBtn.disabled = true;
    configBtn.style.opacity = "0.5";
  } else {
    // Disattivo PA: ripristina valori salvati
    const savedValues = JSON.parse(
      localStorage.getItem(`AUX_backup_${aux}`) || "[]"
    );
    for (let ch = 1; ch <= 24; ch++) {
      const val = savedValues[ch - 1] ?? 0;
      conn.aux(aux).input(ch).setFaderLevel(val);
      auxGroup.querySelector(
        `.fader-row:nth-child(${ch}) .fader-value`
      ).textContent = val.toFixed(2);
    }

    paActive = false;
    paBtn.style.background = "#333";
    paBtn.style.color = "#00ffc8";
    auxGroup.classList.remove("aux-dimmed");
    configBtn.disabled = false;
    configBtn.style.opacity = "1";
  }
});

// MOSTRA SOLO IL GRUPPO DELL'AUX SELEZIONATO E aggiorna header
selectedAux$.subscribe((aux) => {
  document.querySelectorAll(".aux-group").forEach((g) => {
    g.style.display = g.id === `aux-${aux}-group` ? "grid" : "none";
  });

  const radioLabel = document.getElementById(`label-aux-${aux}`);
  if (radioLabel) headerTitle.textContent = radioLabel.textContent;
});

// --- FOOTER SLIDERS PER MASTER AUX ---
const footer = document.querySelector("footer");
const footerSliders = {};

for (let aux = 1; aux <= 10; aux++) {
  const container = document.createElement("div");
  container.className = "footer-aux-slider";
  container.style.display = "none"; // nascosto di default

  const label = document.createElement("label");
  label.htmlFor = `volume-slider-${aux}`;
  label.textContent = "Master AUX";
  container.appendChild(label);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.id = `volume-slider-${aux}`;
  slider.min = 0;
  slider.max = 1;
  slider.step = 0.05;
  slider.value = 0.5;
  container.appendChild(slider);

  const valueEl = document.createElement("span");
  valueEl.id = `volume-value-${aux}`;
  valueEl.textContent = "0.50";
  container.appendChild(valueEl);

  footer.appendChild(container);

  footerSliders[aux] = { container, slider, valueEl };

  // sottoscrizione al Master Level
  conn.master
    .aux(aux)
    .faderLevel$.pipe(distinctUntilChanged(), auditTime(32))
    .subscribe((level) => {
      slider.value = level.toFixed(2);
      valueEl.textContent = level.toFixed(2);
    });

  // input slider → aggiorna solo il Master Level dell'AUX
  slider.addEventListener("input", () => {
    const value = parseFloat(slider.value);
    valueEl.textContent = value.toFixed(2);
    conn.master.aux(aux).setFaderLevel(value);
  });
}

// mostra solo lo slider dell'AUX selezionato
selectedAux$.subscribe((aux) => {
  for (let i = 1; i <= 10; i++) {
    footerSliders[i].container.style.display = i === aux ? "flex" : "none";
  }
});

// --- funzione per adattare aux-container ---
function fitAuxContainer() {
  const aux = document.querySelector("#aux-container > .aux-group.active");
  if (!aux) return;

  const container = document.getElementById("aux-container");
  const scale = Math.min(1, container.clientHeight / aux.scrollHeight);
  aux.style.transform = `scale(${scale})`;
  aux.style.transformOrigin = "top center";
}

window.addEventListener("resize", fitAuxContainer);
window.addEventListener("orientationchange", fitAuxContainer);
fitAuxContainer();

let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  },
  false
);


// Connessione mixer
//conn.connect();
conn.status$.subscribe(status => {
  addLog("UI24R state: ", state);
});
