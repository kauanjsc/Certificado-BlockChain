/* ═══════════════════════════════════════════════════
   AcademicChain — Frontend App (Ethers.js v6)
   ═══════════════════════════════════════════════════

   IMPORTANTE: Após o deploy, atualize CONTRACT_ADDRESS
   com o endereço retornado pelo script deploy.js.
   ═══════════════════════════════════════════════════ */

// ─── Redes Suportadas ────────────────────────────────
// O site detecta o chainId do MetaMask e usa o endereço/explorer da rede ativa.
// Após `npm run deploy:sepolia`, cole o endereço retornado em "0xaa36a7".address.
const NETWORKS = {
  // Hardhat local (31337)
  "0x7a69": {
    address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    chain: {
      chainId: "0x7a69",
      chainName: "Hardhat Local",
      rpcUrls: ["http://127.0.0.1:8545"],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
  },
  // Sepolia testnet (11155111)
  "0xaa36a7": {
    address: "0x47B40f1382f0089a5F846762A8F30dD14F5710B6",
    chain: {
      chainId: "0xaa36a7",
      chainName: "Sepolia",
      rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
      nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
      blockExplorerUrls: ["https://sepolia.etherscan.io"],
    },
  },
};

// Rede usada por padrão quando o MetaMask está numa rede não suportada
const DEFAULT_CHAIN_ID = "0x7a69";

// Estado da rede ativa (atualizado conforme o chainId do MetaMask)
let CONTRACT_ADDRESS = NETWORKS[DEFAULT_CHAIN_ID].address;
let activeChain      = NETWORKS[DEFAULT_CHAIN_ID].chain;

// Aplica a config da rede informada. Retorna false se a rede não for suportada.
function applyNetwork(chainId) {
  const net = NETWORKS[chainId];
  if (!net) return false;
  CONTRACT_ADDRESS = net.address;
  activeChain      = net.chain;
  updateFooterAddress();
  return true;
}

// ABI mínima necessária para interagir com o contrato
const CONTRACT_ABI = [
  // ── Funções de Escrita ──
  "function registerDiploma(string _studentName, string _studentId, string _course, string _completionDate, string _pdfHash) external",
  "function revokeDiploma(string _studentId) external",
  "function reactivateDiploma(string _studentId) external",
  // ── Funções de Leitura ──
  "function getDiploma(string _studentId) external view returns (string studentName, string studentId, string course, string completionDate, string pdfHash, uint256 registeredAt, bool isValid)",
  "function isDiplomaValid(string _studentId) external view returns (bool)",
  "function getStudentIdByHash(string _pdfHash) external view returns (string studentId)",
  "function diplomaRegistered(string _studentId) external view returns (bool)",
  "function totalDiplomas() external view returns (uint256)",
  "function owner() external view returns (address)",
  // ── Eventos ──
  "event DiplomaRegistered(string indexed studentId, string studentName, string course, string completionDate, string pdfHash, uint256 timestamp)",
  "event DiplomaRevoked(string indexed studentId, uint256 timestamp)",
  "event DiplomaReactivated(string indexed studentId, uint256 timestamp)",
];

// ─── Estado Global ───────────────────────────────────
let provider   = null;   // ethers.BrowserProvider
let signer     = null;   // Signer (conta conectada)
let contract   = null;   // Instância do contrato
let isOwner    = false;  // Se o usuário é o dono do contrato
let toastTimer = null;   // Timer do toast

// ─────────────────────────────────────────────────────
//  Inicialização
// ─────────────────────────────────────────────────────

window.addEventListener("load", () => {
  // Drag & drop para o formulário de registro
  setupDragDrop("dropZone", "pdfFile");

  // Atualiza o endereço no footer
  updateFooterAddress();

  // Se o MetaMask já estava conectado, tenta reconectar silenciosamente
  if (typeof window.ethereum !== "undefined") {
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged",    () => window.location.reload());
    silentReconnect();
  }
});

// Reconecta sem abrir o popup, se a conta já tiver sido autorizada antes
async function silentReconnect() {
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    // eth_accounts NÃO abre popup — só retorna contas já autorizadas
    const accounts = await provider.send("eth_accounts", []);
    if (!accounts.length) { provider = null; return; }

    // Detecta a rede atual; se não for suportada, avisa e não tenta ler o contrato
    const chainId = await provider.send("eth_chainId", []);
    if (!applyNetwork(chainId)) {
      provider = signer = contract = null;
      showToast(`Rede não suportada. Conecte-se em ${NETWORKS[DEFAULT_CHAIN_ID].chain.chainName} ou Sepolia.`, "error");
      return;
    }

    signer   = await provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    await updateWalletUI(accounts[0]);
  } catch {
    provider = signer = contract = null;
  }
}

function updateFooterAddress() {
  const el   = document.getElementById("footerContractAddress");
  const link = document.getElementById("contractLink");
  if (!el) return;

  const configured = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS)
    && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";

  if (!configured) {
    el.textContent = `Contrato não configurado na rede ${activeChain.chainName} — execute o deploy`;
    if (link) link.removeAttribute("href");
    return;
  }

  el.textContent = CONTRACT_ADDRESS.slice(0, 10) + "…" + CONTRACT_ADDRESS.slice(-8);
  if (link) {
    const explorer = activeChain.blockExplorerUrls && activeChain.blockExplorerUrls[0];
    if (explorer) link.href = `${explorer}/address/${CONTRACT_ADDRESS}`;
    else          link.removeAttribute("href");
  }
}

// ─────────────────────────────────────────────────────
//  Navegação (tabs)
// ─────────────────────────────────────────────────────

function switchTab(tabName) {
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
  document.getElementById(`tab-${tabName}`).classList.add("active");
}

// ─────────────────────────────────────────────────────
//  Conexão MetaMask
// ─────────────────────────────────────────────────────

async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    showToast("MetaMask não encontrado. Instale a extensão em metamask.io", "error");
    return;
  }

  try {
    setButtonLoading("btnConnect", true, "Conectando…");

    // Garante que o MetaMask está numa rede suportada antes de continuar
    await ensureSupportedNetwork();

    provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);

    if (!accounts.length) throw new Error("Nenhuma conta autorizada.");

    signer   = await provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    await updateWalletUI(accounts[0]);
    showToast("Carteira conectada com sucesso!", "success");
  } catch (err) {
    const msg = parseError(err);
    showToast(msg, "error");
    // Só restaura o botão se a conexão falhou; em caso de sucesso o
    // updateWalletUI já deixou o botão como "✓ Conectado".
    setButtonLoading("btnConnect", false, "Conectar MetaMask");
  }
}

// Garante que o MetaMask está numa rede suportada (local ou Sepolia).
// Se já estiver, apenas aplica a config. Caso contrário, tenta trocar para a
// rede padrão e, se ela ainda não estiver cadastrada (erro 4902), adiciona.
async function ensureSupportedNetwork() {
  const current = await window.ethereum.request({ method: "eth_chainId" });
  if (applyNetwork(current)) return;

  const target = NETWORKS[DEFAULT_CHAIN_ID].chain;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: target.chainId }],
    });
  } catch (err) {
    // 4902 = rede ainda não cadastrada no MetaMask → adiciona (e já troca)
    if (err.code === 4902 || err.code === -32603) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [target],
      });
    } else {
      throw err;
    }
  }
  // a troca dispara o evento 'chainChanged' → a página recarrega sozinha
}

async function handleAccountsChanged(accounts) {
  if (!accounts.length) {
    resetWalletState();
    return;
  }
  if (provider) {
    signer   = await provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    await updateWalletUI(accounts[0]);
  }
}

// Desconecta a carteira: revoga a permissão (se suportado) e limpa o estado.
async function disconnectWallet() {
  try {
    // Tenta revogar de fato a permissão, para o silentReconnect não reconectar
    // automaticamente no próximo carregamento. Nem toda versão suporta.
    await window.ethereum.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    /* método não suportado — segue só limpando o estado local */
  }
  resetWalletState();
  showToast("Carteira desconectada.", "info");
}

// Limpa todo o estado da carteira e volta a UI para o modo desconectado.
function resetWalletState() {
  provider = signer = contract = null;
  isOwner  = false;
  setWalletUI("disconnected", "Carteira não conectada");
  document.getElementById("adminBadge").classList.add("hidden");
  document.getElementById("adminWarning").classList.remove("hidden");
  document.getElementById("btnRegister").disabled = true;
  document.getElementById("btnConnect").innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
      <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z"/>
    </svg>
    Conectar MetaMask`;
  toggleWalletButtons(false);
}

// Mostra/esconde os botões Conectar e Sair conforme o estado de conexão.
function toggleWalletButtons(connected) {
  document.getElementById("btnConnect").classList.toggle("hidden", connected);
  document.getElementById("btnDisconnect").classList.toggle("hidden", !connected);
}

async function updateWalletUI(address) {
  const short = address.slice(0, 6) + "…" + address.slice(-4);
  setWalletUI("connected", short);

  // Verifica se é owner
  try {
    if (CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000") {
      const ownerAddr = await contract.owner();
      isOwner = ownerAddr.toLowerCase() === address.toLowerCase();
    }
  } catch { isOwner = false; }

  const adminBadge  = document.getElementById("adminBadge");
  const adminWarn   = document.getElementById("adminWarning");
  const btnRegister = document.getElementById("btnRegister");

  if (isOwner) {
    adminBadge.classList.remove("hidden");
    adminWarn.classList.add("hidden");
    btnRegister.disabled = false;
  } else {
    adminBadge.classList.add("hidden");
    adminWarn.classList.remove("hidden");
    adminWarn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      Sua carteira (${address.slice(0,6)}…${address.slice(-4)}) não é o administrador do contrato. Apenas o administrador pode registrar diplomas.`;
    btnRegister.disabled = true;
  }

  document.getElementById("btnConnect").textContent = "✓ Conectado";
  toggleWalletButtons(true);
}

function setWalletUI(status, text) {
  const el    = document.getElementById("walletStatus");
  const label = document.getElementById("walletStatusText");
  el.className = `wallet-status ${status}`;
  label.textContent = text;
}

// ─────────────────────────────────────────────────────
//  Hash SHA-256 (Web Crypto API)
// ─────────────────────────────────────────────────────

async function sha256(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─────────────────────────────────────────────────────
//  Upload de Arquivo — Registro
// ─────────────────────────────────────────────────────

async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.type !== "application/pdf") {
    showToast("Selecione um arquivo PDF válido.", "error");
    return;
  }

  try {
    document.getElementById("dropZone").classList.add("drag-over");
    const hash = await sha256(file);
    document.getElementById("pdfHash").value       = hash;
    document.getElementById("pdfHashDisplay").textContent = hash;
    document.getElementById("fileName").textContent = `${file.name} (${formatBytes(file.size)})`;
    document.getElementById("fileInfo").classList.remove("hidden");
    document.getElementById("dropZone").classList.remove("drag-over");

    // Habilita o botão somente se a carteira admin estiver conectada
    if (isOwner) document.getElementById("btnRegister").disabled = false;

    showToast("Hash SHA-256 calculado com sucesso!", "success");
  } catch (err) {
    showToast("Erro ao calcular hash: " + err.message, "error");
  }
}

function setupDragDrop(dropZoneId, inputId) {
  const zone = document.getElementById(dropZoneId);
  if (!zone) return;

  zone.addEventListener("dragover", e => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", async e => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (!file) return;
    document.getElementById(inputId).files = e.dataTransfer.files;
    await handleFileSelect({ target: { files: [file] } });
  });
}

// ─────────────────────────────────────────────────────
//  Registrar Diploma
// ─────────────────────────────────────────────────────

async function registerDiploma(event) {
  event.preventDefault();

  if (!contract) { showToast("Conecte sua carteira MetaMask primeiro.", "error"); return; }
  if (!isOwner)  { showToast("Apenas o administrador pode registrar diplomas.", "error"); return; }

  const studentName    = document.getElementById("studentName").value.trim();
  const studentId      = document.getElementById("studentId").value.trim();
  const course         = document.getElementById("course").value.trim();
  const completionDate = document.getElementById("completionDate").value.trim();
  const pdfHash        = document.getElementById("pdfHash").value.trim();

  if (!pdfHash) {
    showToast("Selecione o arquivo PDF do diploma para calcular o hash.", "error");
    return;
  }

  try {
    setButtonLoading("btnRegister", true, "Registrando…");

    const tx = await contract.registerDiploma(studentName, studentId, course, completionDate, pdfHash);
    showToast(`Transação enviada! Aguardando confirmação… (${tx.hash.slice(0,10)}…)`, "info");

    const receipt = await tx.wait();

    showToast(`Diploma registrado com sucesso! Bloco ${receipt.blockNumber}`, "success");
    clearForm();

    // Redireciona para a consulta já preenchida
    document.getElementById("queryStudentId").value = studentId;
    switchTab("query");
    setTimeout(queryDiploma, 800);

  } catch (err) {
    showToast(parseError(err), "error");
  } finally {
    setButtonLoading("btnRegister", false, "Registrar na Blockchain");
    if (isOwner) document.getElementById("btnRegister").disabled = false;
  }
}

function clearForm() {
  document.getElementById("formRegister").reset();
  document.getElementById("fileInfo").classList.add("hidden");
  document.getElementById("pdfHash").value = "";
  if (!isOwner) document.getElementById("btnRegister").disabled = true;
}

// ─────────────────────────────────────────────────────
//  Consultar Diploma
// ─────────────────────────────────────────────────────

async function queryDiploma() {
  const studentId = document.getElementById("queryStudentId").value.trim();
  if (!studentId) { showToast("Digite um CPF ou identificador para consultar.", "error"); return; }

  const resultEl = document.getElementById("queryResult");
  resultEl.classList.add("hidden");
  resultEl.innerHTML = "";

  // Permite leitura sem carteira conectada se o contrato não estiver configurado
  let readContract = contract;
  if (!readContract) {
    if (typeof window.ethereum === "undefined") {
      showToast("MetaMask necessário para consultar dados na blockchain.", "error");
      return;
    }
    const roProvider   = new ethers.BrowserProvider(window.ethereum);
    readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, roProvider);
  }

  try {
    const exists = await readContract.diplomaRegistered(studentId);
    if (!exists) {
      resultEl.innerHTML = buildNotFound(studentId);
      resultEl.classList.remove("hidden");
      return;
    }

    const d = await readContract.getDiploma(studentId);
    resultEl.innerHTML = buildDiplomaCard(d);
    resultEl.classList.remove("hidden");

  } catch (err) {
    showToast(parseError(err), "error");
  }
}

function buildDiplomaCard(d) {
  const valid       = d.isValid;
  const statusClass = valid ? "valid" : "revoked";
  const statusText  = valid ? "Diploma Válido" : "Diploma Revogado";
  const statusIcon  = valid
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20,6 9,17 4,12"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  const registeredDate = new Date(Number(d.registeredAt) * 1000).toLocaleString("pt-BR");

  return `
    <div class="diploma-card ${valid ? "" : "revoked"}">
      <div class="diploma-card-header ${statusClass}">
        <div class="diploma-status ${statusClass}">
          <div class="status-icon ${statusClass}">${statusIcon}</div>
          ${statusText}
        </div>
        <span style="font-size:12px;color:var(--gray-500);font-weight:400">ID: ${escHtml(d.studentId)}</span>
      </div>
      <div class="diploma-card-body">
        <div class="diploma-grid">
          <div class="diploma-field">
            <label>Nome do Aluno</label>
            <span>${escHtml(d.studentName)}</span>
          </div>
          <div class="diploma-field">
            <label>CPF / Identificador</label>
            <span>${escHtml(d.studentId)}</span>
          </div>
          <div class="diploma-field">
            <label>Curso</label>
            <span>${escHtml(d.course)}</span>
          </div>
          <div class="diploma-field">
            <label>Data de Conclusão</label>
            <span>${escHtml(d.completionDate)}</span>
          </div>
        </div>
        <div class="diploma-hash-row">
          <label>Hash SHA-256 do PDF</label>
          <code>${escHtml(d.pdfHash)}</code>
        </div>
        <div class="diploma-timestamp">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
          </svg>
          Registrado na blockchain em: ${registeredDate}
        </div>
      </div>
    </div>`;
}

function buildNotFound(studentId) {
  return `
    <div class="not-found-card">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
      <p>Nenhum diploma encontrado para o identificador <strong>${escHtml(studentId)}</strong></p>
      <p style="font-size:13px;margin-top:8px;color:var(--gray-400)">Verifique se o CPF/identificador está correto ou se o diploma foi registrado nesta rede.</p>
    </div>`;
}

// ─────────────────────────────────────────────────────
//  Verificar Arquivo por Hash
// ─────────────────────────────────────────────────────

async function handleVerifyFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.type !== "application/pdf") {
    showToast("Selecione um arquivo PDF válido.", "error");
    return;
  }

  const resultEl     = document.getElementById("verifyResult");
  const hashInfoEl   = document.getElementById("verifyHashInfo");
  const hashDisplayEl = document.getElementById("verifyHashDisplay");

  resultEl.innerHTML = "";
  resultEl.classList.add("hidden");
  hashInfoEl.classList.add("hidden");

  try {
    showToast("Calculando hash SHA-256…", "info");
    const hash = await sha256(file);
    hashDisplayEl.textContent = hash;
    hashInfoEl.classList.remove("hidden");

    // Consulta o hash na blockchain
    let readContract = contract;
    if (!readContract) {
      if (typeof window.ethereum === "undefined") {
        showToast("MetaMask necessário para consultar a blockchain.", "error");
        return;
      }
      const roProvider = new ethers.BrowserProvider(window.ethereum);
      readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, roProvider);
    }

    showToast("Consultando blockchain…", "info");
    const studentId = await readContract.getStudentIdByHash(hash);

    if (!studentId || studentId === "") {
      resultEl.innerHTML = `
        <div class="diploma-card revoked">
          <div class="verify-banner failure">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            Arquivo NÃO encontrado na blockchain
          </div>
          <div class="diploma-card-body" style="padding-top:16px">
            <p style="color:var(--gray-600);font-size:14px">Este PDF não corresponde a nenhum diploma registrado. Pode estar adulterado ou não ter sido registrado.</p>
            <div class="diploma-hash-row" style="margin-top:16px">
              <label>Hash calculado do arquivo</label>
              <code>${escHtml(hash)}</code>
            </div>
          </div>
        </div>`;
      resultEl.classList.remove("hidden");
      return;
    }

    // Hash encontrado — busca os dados completos do diploma
    const d = await readContract.getDiploma(studentId);
    const statusText = d.isValid ? "Diploma Autêntico e Válido" : "Arquivo registrado, mas diploma REVOGADO";
    const bannerClass = d.isValid ? "success" : "failure";

    resultEl.innerHTML = `
      <div class="diploma-card ${d.isValid ? "" : "revoked"}">
        <div class="verify-banner ${bannerClass}">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            ${d.isValid
              ? `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>`
              : `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`}
          </svg>
          ${statusText}
        </div>
        ${buildDiplomaCard(d).replace('<div class="diploma-card', '<div').replace('</div>', '').split('\n').slice(2).join('\n')}
      </div>`;

    // Mais limpo: re-usa buildDiplomaCard
    resultEl.innerHTML = `
      <p style="font-size:14px;font-weight:600;color:${d.isValid ? 'var(--green-700)' : 'var(--red-600)'};margin-bottom:16px;display:flex;align-items:center;gap:8px">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          ${d.isValid
            ? `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>`
            : `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`}
        </svg>
        ${statusText}
      </p>
      ${buildDiplomaCard(d)}`;
    resultEl.classList.remove("hidden");

  } catch (err) {
    showToast(parseError(err), "error");
  }
}

// ─────────────────────────────────────────────────────
//  Utilitários de UI
// ─────────────────────────────────────────────────────

function showToast(message, type = "info") {
  clearTimeout(toastTimer);
  const toast = document.getElementById("toast");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.classList.remove("hidden");
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 5000);
}

function setButtonLoading(btnId, loading, text) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> ${text}`;
  } else {
    btn.disabled = false;
    btn.textContent = text;
  }
}

function parseError(err) {
  if (err.code === 4001 || err.code === "ACTION_REJECTED") return "Transação cancelada pelo usuário.";
  if (err.code === -32002) return "Abra o MetaMask para aprovar a solicitação pendente.";
  if (err.reason) return `Erro do contrato: ${err.reason}`;
  if (err.message) {
    const m = err.message;
    // Extrai mensagem do revert Solidity
    const revertMatch = m.match(/reverted with reason string '([^']+)'/);
    if (revertMatch) return `Contrato: ${revertMatch[1]}`;
    const revert2 = m.match(/"message":"([^"]+)"/);
    if (revert2) return revert2[1];
    if (m.includes("user rejected")) return "Transação cancelada pelo usuário.";
    if (m.includes("insufficient funds")) return "Saldo insuficiente para pagar o gas.";
    return m.length > 120 ? m.slice(0, 120) + "…" : m;
  }
  return "Erro desconhecido. Verifique o console.";
}

// ─────────────────────────────────────────────────────
//  Máscaras de Input (CPF e Data)
// ─────────────────────────────────────────────────────

// Formata o campo como CPF enquanto o usuário digita: 000.000.000-00
function maskCPF(el) {
  const d = el.value.replace(/\D/g, "").slice(0, 11);
  let out = d;
  if (d.length > 9)      out = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  else if (d.length > 6) out = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  else if (d.length > 3) out = `${d.slice(0, 3)}.${d.slice(3)}`;
  el.value = out;
}

// Formata o campo como data enquanto o usuário digita: DD/MM/AAAA
function maskDate(el) {
  const d = el.value.replace(/\D/g, "").slice(0, 8);
  let out = d;
  if (d.length > 4)      out = `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  else if (d.length > 2) out = `${d.slice(0, 2)}/${d.slice(2)}`;
  el.value = out;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
