/* ============================================================
   Pressupost de casa
   ------------------------------------------------------------
   Totes les dades viuen a Supabase i estan protegides per Row
   Level Security: sense sessió iniciada no es veu cap fila, i
   amb sessió només es veuen les de la teva llar. La clau que hi
   ha a config.js és pública per disseny i no dona accés a res.
   ============================================================ */

const $  = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const eur = n => (Number(n) || 0).toLocaleString("ca-ES",
  { style:"currency", currency:"EUR", minimumFractionDigits:2 });
const esc = s => String(s ?? "").replace(/[&<>"']/g,
  c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const avui = () => new Date().toLocaleDateString("sv-SE");   // AAAA-MM-DD en local
const mesActual = () => avui().slice(0,7);
const dataCat = d => d.split("-").reverse().join("/");

const BUTXACA = "__butxaca__";                  // categoria especial: diners propis

let sb = null;
const S = { user:null, jo:null, llar:null, membres:[], cats:[], conf:null, movs:[], mes:mesActual() };

/* ---------- avisos ---------- */
let toastT;
function toast(msg, ms = 2600){
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), ms);
}
function alerta(cont, tipus, msg){
  cont.innerHTML = msg ? `<div class="alert ${tipus}">${esc(msg)}</div>` : "";
}

/* ============================================================
   ARRENCADA
   ============================================================ */
(function init(){
  // Compte: config.js declara CONFIG amb "const", i les declaracions const
  // d'un script clàssic NO es pengen de window. Cal mirar-ho amb typeof.
  const cfg = (typeof CONFIG !== "undefined") ? CONFIG : null;
  const bad = !cfg || !cfg.url || !cfg.anonKey
    || cfg.url.includes("EL-TEU-PROJECTE") || cfg.anonKey.includes("LA-TEVA-CLAU");
  if (bad){
    $("login-config").innerHTML =
      "⚠️ Falta configurar <code>config.js</code> amb l'adreça i la clau del projecte de Supabase. " +
      "Les instruccions són al <code>README.md</code>.";
    $("form-login").querySelectorAll("input,button").forEach(e => e.disabled = true);
    return;
  }
  sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth:{ persistSession:true, autoRefreshToken:true }
  });
  sb.auth.onAuthStateChange((_e, sess) => sess?.user ? entrar(sess.user) : sortir());
  sb.auth.getSession().then(({ data }) => { if (!data.session) mostraLogin(); });
})();

function mostraLogin(){ $("view-login").hidden = false; $("view-app").hidden = true; }

/* ---------- login ---------- */
$("form-login").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("li-btn"), txt = btn.textContent;
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  alerta($("login-alert"), "err", "");
  const { error } = await sb.auth.signInWithPassword({
    email: $("li-email").value.trim(), password: $("li-pass").value
  });
  btn.disabled = false; btn.textContent = txt;
  if (error){
    alerta($("login-alert"), "err",
      /invalid/i.test(error.message) ? "Correu o contrasenya incorrectes." : error.message);
  }
});

$("btn-sortir").addEventListener("click", () => sb.auth.signOut());
function sortir(){ mostraLogin(); $("li-pass").value = ""; }

/* ============================================================
   CÀRREGA
   ============================================================ */
async function entrar(user){
  S.user = user;
  $("view-login").hidden = true; $("view-app").hidden = false;
  $("mes").value = S.mes; $("m-data").value = avui();

  const [me, cats, conf, membres] = await Promise.all([
    sb.from("membres").select("*").eq("user_id", user.id).maybeSingle(),
    sb.from("categories").select("*").order("ordre"),
    sb.from("config").select("*").maybeSingle(),
    sb.from("membres").select("*").order("nom")
  ]);

  if (me.error || !me.data){
    document.querySelector("#view-app .shell").innerHTML =
      `<div class="alert err" style="margin-top:24px">El teu usuari existeix però encara no està
       donat d'alta com a membre de cap llar. Cal executar el bloc de dades inicials del
       <code>supabase-setup.sql</code>.</div>`;
    return;
  }

  S.jo = me.data; S.cats = cats.data || []; S.conf = conf.data || {}; S.membres = membres.data || [];

  const llar = await sb.from("llars").select("*").maybeSingle();
  S.llar = llar.data;
  $("nom-llar").textContent = S.llar?.nom || "Pressupost de casa";
  $("jo-nom").textContent = S.jo.nom;
  $("jo-dot").style.background = S.jo.color;

  omplirSelects();
  await carregaMes();
  realtime();
}

function omplirSelects(){
  const sel = $("m-cat");
  sel.innerHTML = `<option value="${BUTXACA}">💳 La meva butxaca</option>`;
  let bloc = null;
  S.cats.forEach(c => {
    if (c.bloc !== bloc){ bloc = c.bloc; sel.appendChild(Object.assign(document.createElement("optgroup"), { label:bloc })); }
    sel.lastChild.appendChild(new Option(c.nom, c.id));
  });
  const f = $("filtre-qui");
  f.innerHTML = '<option value="">Tothom</option>';
  S.membres.forEach(m => f.add(new Option(m.nom, m.user_id)));

  $("c-ing").value = S.conf.ingressos ?? "";
  $("c-fix").value = S.conf.fixos ?? "";
  $("c-obj").value = S.conf.objectiu ?? "";
  $("p-nom").value = S.jo.nom;
  $("p-but").value = S.jo.butxaca;
}

async function carregaMes(){
  const ini = S.mes + "-01";
  const [y, m] = S.mes.split("-").map(Number);
  const fi = new Date(y, m, 0).toLocaleDateString("sv-SE");
  const { data, error } = await sb.from("moviments").select("*")
    .gte("data", ini).lte("data", fi).order("data", { ascending:false });
  if (error){ toast("No s'han pogut carregar els moviments"); return; }
  S.movs = data || [];
  pintaTot();
}

$("mes").addEventListener("change", e => { S.mes = e.target.value || mesActual(); carregaMes(); });

/* ---------- temps real ---------- */
function realtime(){
  sb.channel("moviments-llar")
    .on("postgres_changes", { event:"*", schema:"public", table:"moviments" }, carregaMes)
    .subscribe();
}

/* ============================================================
   CÀLCULS
   ============================================================ */
const gastatCat  = id  => S.movs.filter(m => m.categoria_id === id).reduce((a,b) => a + Number(b.import), 0);
const gastatPers = uid => S.movs.filter(m => !m.categoria_id && m.user_id === uid).reduce((a,b) => a + Number(b.import), 0);
const totalVariable = () =>
  S.movs.reduce((a,b) => a + Number(b.import), 0);

function estat(pct){
  if (pct > 1)    return ["p-bad",  "var(--bad)"];
  if (pct >= .85) return ["p-warn", "var(--warn)"];
  return ["p-ok", "var(--ok)"];
}

/* ============================================================
   PINTAT
   ============================================================ */
function pintaTot(){ pintaResum(); pintaPersones(); pintaMoviments(); pintaCats(); }

function pintaResum(){
  let html = "", tl = 0, tg = 0;
  S.cats.forEach(c => {
    const lim = Number(c.limit_mes), g = gastatCat(c.id), pct = lim ? g/lim : 0;
    tl += lim; tg += g;
    const [cls, col] = estat(pct);
    html += `<tr>
      <td><span class="bloc-tag">${esc(c.bloc)}</span><span class="cat-name">${esc(c.nom)}</span>
        <div class="bar"><i style="width:${Math.min(pct*100,100)}%;background:${col}"></i></div></td>
      <td class="num">${eur(lim)}</td>
      <td class="num">${eur(g)}</td>
      <td class="num"><span class="pill ${cls}">${eur(lim-g)}</span></td></tr>`;
  });
  const butLim = S.membres.reduce((a,m) => a + Number(m.butxaca), 0);
  const butG   = S.membres.reduce((a,m) => a + gastatPers(m.user_id), 0);
  tl += butLim; tg += butG;
  const [bc, bcol] = estat(butLim ? butG/butLim : 0);
  html += `<tr>
      <td><span class="bloc-tag">PERSONAL</span><span class="cat-name">Butxaques de tots</span>
        <div class="bar"><i style="width:${Math.min(butLim?butG/butLim*100:0,100)}%;background:${bcol}"></i></div></td>
      <td class="num">${eur(butLim)}</td><td class="num">${eur(butG)}</td>
      <td class="num"><span class="pill ${bc}">${eur(butLim-butG)}</span></td></tr>`;
  html += `<tr style="font-weight:700;background:var(--surface-2)">
      <td>TOTAL VARIABLE</td><td class="num">${eur(tl)}</td>
      <td class="num">${eur(tg)}</td><td class="num">${eur(tl-tg)}</td></tr>`;
  $("t-resum").innerHTML = html;

  const ing = Number(S.conf.ingressos)||0, fix = Number(S.conf.fixos)||0, obj = Number(S.conf.objectiu)||0;
  const estalvi = ing - fix - totalVariable();
  $("estalvi").textContent = eur(estalvi);
  $("hero").className = "hero " + (estalvi >= obj ? "good" : "bad");
  $("estalvi-sub").textContent =
    `${eur(ing)} d'ingressos − ${eur(fix)} de fixos − ${eur(totalVariable())} de variable. Objectiu: ${eur(obj)}.`;
}

function pintaPersones(){
  $("persones").innerHTML = S.membres.map(m => {
    const lim = Number(m.butxaca), g = gastatPers(m.user_id), pct = lim ? g/lim : 0;
    const [, col] = estat(pct);
    const jo = m.user_id === S.user.id;
    const nMovs = S.movs.filter(x => x.user_id === m.user_id).length;
    return `<div class="person" style="--pc:${esc(m.color)}">
      <h3><span class="dot"></span>${esc(m.nom)}${jo ? ' <span class="note">(tu)</span>' : ""}</h3>
      <div class="amt">${eur(g)}</div>
      <div class="of">${lim ? `de ${eur(lim)} de butxaca` : "sense butxaca assignada"}</div>
      ${lim ? `<div class="bar"><i style="width:${Math.min(pct*100,100)}%;background:${col}"></i></div>` : ""}
      <div class="meta"><span>${nMovs} moviment${nMovs===1?"":"s"} aquest mes</span>
        ${lim ? `<span>${Math.round(pct*100)}%</span>` : ""}</div></div>`;
  }).join("") || `<p class="empty">Cap membre donat d'alta.</p>`;

  const files = [];
  S.membres.forEach(m => {
    const seus = S.movs.filter(x => x.user_id === m.user_id);
    const per = {};
    seus.forEach(x => {
      const nom = x.categoria_id ? (S.cats.find(c => c.id === x.categoria_id)?.nom || "—") : "La seva butxaca";
      per[nom] = (per[nom]||0) + Number(x.import);
    });
    Object.entries(per).sort((a,b) => b[1]-a[1]).forEach(([cat, imp], i) => {
      files.push(`<tr><td>${i===0 ? `<span class="dot" style="background:${esc(m.color)};display:inline-block;margin-right:7px"></span>${esc(m.nom)}` : ""}</td>
        <td>${esc(cat)}</td><td class="num">${eur(imp)}</td></tr>`);
    });
  });
  $("t-persones").innerHTML = files.join("") || `<tr><td colspan="3" class="empty">Cap despesa aquest mes.</td></tr>`;
}

function pintaMoviments(){
  const filtre = $("filtre-qui").value;
  const llista = filtre ? S.movs.filter(m => m.user_id === filtre) : S.movs;
  $("t-moviments").innerHTML = llista.map(m => {
    const qui = S.membres.find(x => x.user_id === m.user_id);
    const cat = m.categoria_id ? (S.cats.find(c => c.id === m.categoria_id)?.nom || "—") : "La seva butxaca";
    const meu = m.user_id === S.user.id;
    return `<tr>
      <td>${dataCat(m.data)}</td>
      <td><span class="dot" style="background:${esc(qui?.color||"#888")};display:inline-block;margin-right:6px"></span>${esc(qui?.nom||"?")}</td>
      <td>${esc(cat)}</td>
      <td class="num">${eur(m.import)}</td>
      <td class="hide-s note">${esc(m.nota||"")}</td>
      <td class="num">${meu ? `<button class="icon-btn" data-del="${m.id}" title="Esborrar" aria-label="Esborrar">×</button>` : ""}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="6" class="empty">Cap moviment aquest mes.</td></tr>`;

  $$("[data-del]").forEach(b => b.onclick = async () => {
    if (!confirm("Esborrar aquest moviment?")) return;
    b.disabled = true;
    // Amb .select() sabem quantes files s'han esborrat de debò. Sense això,
    // si el RLS ho rebutja no hi ha error i sembla que hagi funcionat.
    const { data, error } = await sb.from("moviments")
      .delete().eq("id", b.dataset.del).select();
    b.disabled = false;
    if (error){ toast("Error: " + error.message, 6000); console.error(error); return; }
    if (!data || data.length === 0){
      toast("No s'ha esborrat: només pots esborrar els teus moviments", 5000); return;
    }
    toast("Esborrat");
    carregaMes();
  });
}
$("filtre-qui").addEventListener("change", pintaMoviments);

function pintaCats(){
  $("t-cats").innerHTML = S.cats.map(c =>
    `<tr><td><span class="bloc-tag">${esc(c.bloc)}</span><span class="cat-name">${esc(c.nom)}</span></td>
     <td class="num"><input type="number" step="0.01" value="${Number(c.limit_mes)}" data-cat="${c.id}" style="text-align:right"></td></tr>`
  ).join("");
  $$("[data-cat]").forEach(inp => inp.onchange = async () => {
    const v = parseFloat(inp.value);
    if (isNaN(v) || v < 0){ toast("Import no vàlid"); return; }
    const { error } = await sb.from("categories").update({ limit_mes:v }).eq("id", inp.dataset.cat);
    if (error){ toast("No s'ha pogut desar"); return; }
    const c = S.cats.find(x => x.id === inp.dataset.cat); c.limit_mes = v;
    pintaResum(); toast("Límit desat");
  });
}

/* ============================================================
   ACCIONS
   ============================================================ */
$("form-mov").addEventListener("submit", async e => {
  e.preventDefault();
  const imp = parseFloat($("m-imp").value);
  if (!(imp > 0)) return toast("Falta l'import");
  const cat = $("m-cat").value;
  const btn = $("m-btn"); btn.disabled = true;
  const { error } = await sb.from("moviments").insert({
    llar_id: S.jo.llar_id, user_id: S.user.id,
    data: $("m-data").value,
    categoria_id: cat === BUTXACA ? null : cat,
    import: Math.round(imp*100)/100,
    nota: $("m-nota").value.trim() || null
  });
  btn.disabled = false;
  if (error) return toast("No s'ha pogut apuntar: " + error.message);
  $("m-imp").value = ""; $("m-nota").value = "";
  const mesMov = $("m-data").value.slice(0,7);
  if (mesMov !== S.mes){ S.mes = mesMov; $("mes").value = mesMov; }
  toast("Apuntat ✓");
  carregaMes();
});

$("c-desa").addEventListener("click", async () => {
  const dades = {
    llar_id: S.jo.llar_id,
    ingressos: parseFloat($("c-ing").value)||0,
    fixos:     parseFloat($("c-fix").value)||0,
    objectiu:  parseFloat($("c-obj").value)||0
  };
  const { error } = await sb.from("config").upsert(dades, { onConflict:"llar_id" });
  if (error) return toast("No s'ha pogut desar");
  Object.assign(S.conf, dades); pintaResum(); toast("Desat ✓");
});

$("p-desa").addEventListener("click", async () => {
  const nom = $("p-nom").value.trim();
  if (!nom) return toast("El nom no pot quedar buit");
  const but = parseFloat($("p-but").value)||0;
  const { error } = await sb.from("membres").update({ nom, butxaca:but }).eq("user_id", S.user.id);
  if (error) return toast("No s'ha pogut desar");
  S.jo.nom = nom; S.jo.butxaca = but;
  const m = S.membres.find(x => x.user_id === S.user.id); if (m){ m.nom = nom; m.butxaca = but; }
  $("jo-nom").textContent = nom;
  omplirSelects(); pintaTot(); toast("Desat ✓");
});

$("export").addEventListener("click", async () => {
  const { data, error } = await sb.from("moviments").select("*").order("data");
  if (error) return toast("No s'ha pogut exportar");
  const files = (data||[]).map(m => [
    m.data,
    S.membres.find(x => x.user_id === m.user_id)?.nom || "",
    m.categoria_id ? (S.cats.find(c => c.id === m.categoria_id)?.nom || "") : "Butxaca personal",
    String(m.import).replace(".", ","),
    (m.nota||"").replace(/"/g,'""')
  ].map(v => `"${v}"`).join(";"));
  const csv = "﻿" + ["data;qui;categoria;import;nota", ...files].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8" }));
  a.download = `pressupost-${avui()}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`${files.length} moviments exportats`);
});

/* ---------- pestanyes ---------- */
$$(".tab").forEach(t => t.onclick = () => {
  $$(".tab").forEach(x => x.setAttribute("aria-selected", String(x === t)));
  ["resum","persones","moviments","ajustos"].forEach(n => $("tab-"+n).hidden = (n !== t.dataset.tab));
});
