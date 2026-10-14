let adminPassword = "";
let cachedLeads = [];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (adminPassword) headers["x-admin-password"] = adminPassword;
  const response = await fetch(url, { ...options, headers });
  const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
  if (response.status === 401) { logout(); throw new Error("Please log in again."); }
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}
function message(text, bad = false) { $("appMessage").textContent = text; $("appMessage").style.color = bad ? "#a32b25" : "#187346"; }
function login() {
  $("loginPanel").classList.add("hidden"); $("appPanel").classList.remove("hidden"); $("logoutBtn").classList.remove("hidden"); loadAll();
}
function logout() {
  adminPassword = ""; $("appPanel").classList.add("hidden"); $("logoutBtn").classList.add("hidden"); $("loginPanel").classList.remove("hidden"); $("password").value = "";
}
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault(); $("loginError").textContent = "";
  try { await api("/api/login", { method: "POST", headers: {}, body: JSON.stringify({ password: $("password").value }) }); adminPassword = $("password").value; login(); }
  catch (err) { $("loginError").textContent = err.message; }
});
$("logoutBtn").addEventListener("click", logout);
let discoveredBusinesses = [];
async function loadAll() {
  try {
    cachedLeads = await api("/api/leads");
    renderLeads();
    renderActivity(await api("/api/activity"));
    renderOutreachStatus(await api("/api/outreach-status"));
  }
  catch (err) { message(err.message, true); }
}
function renderOutreachStatus(status) {
  const whatsapp = status.whatsapp;
  $("whatsappSetupStatus").textContent = whatsapp.configured
    ? "WhatsApp Cloud API is configured. Sending still requires genuine contact permission and an approved template."
    : `WhatsApp is not configured yet. Add ${whatsapp.missing.join(", ")} to .env, then restart the app.`;
}
function renderLeads() {
  const q = $("searchInput").value.toLowerCase(), stage = $("stageFilter").value;
  const visible = cachedLeads.filter(l => (!stage || l.stage === stage) && [l.businessName,l.category,l.service,l.phone,l.email].join(" ").toLowerCase().includes(q));
  $("totalStat").textContent = cachedLeads.length;
  $("permissionStat").textContent = cachedLeads.filter(l => l.contactPermission && l.permissionSource && !l.optedOut).length;
  $("interestedStat").textContent = cachedLeads.filter(l => ["Interested","Quoted"].includes(l.stage)).length;
  $("wonStat").textContent = cachedLeads.filter(l => l.stage === "Won").length;
  $("leadCount").textContent = `${visible.length} lead${visible.length === 1 ? "" : "s"}`;
  $("leadList").innerHTML = "";
  $("emptyState").classList.toggle("hidden", visible.length > 0);
  for (const lead of visible) {
    const node = $("leadTemplate").content.firstElementChild.cloneNode(true);
    node.querySelector(".lead-name").textContent = lead.businessName;
    const badge = node.querySelector(".stage-badge"); badge.textContent = lead.stage; badge.classList.add(lead.stage.toLowerCase().replace(/\s+/g,"-"));
    node.querySelector(".lead-meta").textContent = [lead.category, lead.area, lead.address].filter(Boolean).join(" · ");
    const details = [];
    if (lead.phone) details.push(`<span>☎ ${esc(lead.phone)}</span>`);
    if (lead.email) details.push(`<span>✉ ${esc(lead.email)}</span>`);
    if (lead.website) details.push(`<a href="${esc(lead.website)}" target="_blank" rel="noopener noreferrer">Website ↗</a>`);
    if (lead.openingHours) details.push(`<span>Hours: ${esc(lead.openingHours)}</span>`);
    if (lead.sourceUrl) details.push(`<a href="${esc(lead.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source listing ↗</a>`);
    details.push(`<span>Offer: ${esc(lead.service || "Not selected")}</span>`);
    node.querySelector(".lead-details").innerHTML = details.join("");
    node.querySelector(".lead-notes").textContent = lead.notes || "";
    const opportunityLine = node.querySelector(".opportunity-line");
    opportunityLine.textContent = lead.opportunityReason ? `Suggested fit: ${lead.service}. ${lead.opportunityReason}` : "";
    opportunityLine.classList.toggle("hidden", !lead.opportunityReason);
    node.querySelector(".permission-line").textContent = lead.optedOut ? "⛔ Do not contact" : (lead.contactPermission && lead.permissionSource ? `✓ Permission recorded: ${lead.permissionSource}` : "⚠ No contact permission recorded — sending blocked");
    node.querySelector(".edit-btn").onclick = () => fillForm(lead);
    node.querySelector(".email-btn").onclick = () => send(lead, "email");
    node.querySelector(".whatsapp-btn").onclick = () => send(lead, "whatsapp");
    node.querySelector(".contact-guide-btn").onclick = () => openContactGuide(lead);
    node.querySelector(".optout-btn").onclick = () => optOut(lead);
    node.querySelector(".delete-btn").onclick = () => removeLead(lead);
    node.querySelector(".email-btn").disabled = !lead.email;
    node.querySelector(".whatsapp-btn").disabled = !lead.phone;
    if (lead.optedOut) { node.querySelector(".email-btn").disabled = true; node.querySelector(".whatsapp-btn").disabled = true; }
    $("leadList").appendChild(node);
  }
}
function renderActivity(items) {
  $("activityList").innerHTML = "";
  if (!items.length) { $("activityList").innerHTML = '<p class="muted small">Activity will appear here as you manage leads.</p>'; return; }
  for (const item of items.slice(0, 12)) {
    const row = document.createElement("div"); row.className = "activity-item";
    const when = item.at ? new Date(item.at).toLocaleString() : "";
    row.innerHTML = `<span class="activity-dot"></span><div>${esc((item.action || "activity").replaceAll("_"," "))} · ${esc(item.businessName || "")}${item.error ? `<div class="error">${esc(item.error)}</div>` : ""}<time>${esc(when)}</time></div>`;
    $("activityList").appendChild(row);
  }
}
function openForm() {
  $("leadFormPanel").classList.remove("hidden"); $("leadFormPanel").scrollIntoView({behavior:"smooth",block:"start"});
}
function clearForm() {
  $("leadForm").reset(); $("leadId").value = ""; $("area").value = "Mzuzu"; $("formTitle").textContent = "Add a business lead";
}
function fillForm(l) {
  openForm(); $("formTitle").textContent = "Edit business lead";
  for (const key of ["id","businessName","category","area","phone","email","website","address","openingHours","sourceUrl","service","opportunityReason","stage","permissionSource","followUpDate","notes"]) {
    const element = $(key === "id" ? "leadId" : key); if (element) element.value = l[key] || "";
  }
  $("contactPermission").checked = Boolean(l.contactPermission);
}
$("newLeadBtn").onclick = () => { clearForm(); openForm(); };
$("emptyAddBtn").onclick = () => { clearForm(); openForm(); };
$("cancelFormBtn").onclick = () => $("leadFormPanel").classList.add("hidden");
$("searchInput").addEventListener("input", renderLeads);
$("stageFilter").addEventListener("change", renderLeads);
$("discoveryForm").addEventListener("submit", async e => {
  e.preventDefault();
  const button = $("discoveryButton");
  button.disabled = true;
  $("discoveryStatus").textContent = "Searching OpenStreetMap…";
  $("discoveryResults").replaceChildren();
  try {
    discoveredBusinesses = await api(`/api/discover?category=${encodeURIComponent($("discoveryCategory").value)}`);
    renderDiscoveryResults();
    $("discoveryStatus").textContent = discoveredBusinesses.length
      ? `Found ${discoveredBusinesses.length} businesses. Review the details before adding.`
      : "No businesses found for this category. Try another search; local map coverage may be incomplete.";
  } catch (err) {
    $("discoveryStatus").textContent = err.message;
  } finally {
    button.disabled = false;
  }
});
function renderDiscoveryResults() {
  const results = $("discoveryResults");
  results.replaceChildren();
  for (const business of discoveredBusinesses) {
    const card = document.createElement("article");
    card.className = "discovery-card";
    const info = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = business.businessName;
    const meta = document.createElement("p");
    meta.className = "muted small";
    meta.textContent = [business.category, business.details, business.phone, business.email].filter(Boolean).join(" · ");
    info.append(name, meta);
    const publicDetails = document.createElement("p");
    publicDetails.className = "muted small";
    publicDetails.textContent = [business.address, business.openingHours && `Hours: ${business.openingHours}`].filter(Boolean).join(" · ");
    if (publicDetails.textContent) info.append(publicDetails);
    const opportunity = document.createElement("p");
    opportunity.className = "opportunity-line";
    opportunity.textContent = `Suggested fit: ${business.recommendation.service}. ${business.recommendation.reason}`;
    info.append(opportunity);
    const contactHint = document.createElement("p");
    contactHint.className = "muted small";
    contactHint.textContent = "Verify details, use an official contact route, and ask permission before sending marketing messages.";
    info.append(contactHint);
    if (business.website) {
      const website = document.createElement("a");
      website.href = business.website;
      website.target = "_blank";
      website.rel = "noopener noreferrer";
      website.textContent = "Website";
      info.append(website);
    }
    const actions = document.createElement("div");
    actions.className = "discovery-actions";
    const mapLink = document.createElement("a");
    mapLink.href = business.mapUrl;
    mapLink.target = "_blank";
    mapLink.rel = "noopener noreferrer";
    mapLink.className = "button small secondary";
    mapLink.textContent = "View map";
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "button small primary";
    const alreadyAdded = cachedLeads.some(lead =>
      lead.sourceId === business.sourceId ||
      lead.businessName.trim().toLowerCase() === business.businessName.trim().toLowerCase()
    );
    addButton.textContent = alreadyAdded ? "Already added" : "Add to leads";
    addButton.disabled = alreadyAdded;
    addButton.addEventListener("click", () => addDiscoveredBusiness(business, addButton));
    actions.append(mapLink, addButton);
    card.append(info, actions);
    results.appendChild(card);
  }
}
async function addDiscoveredBusiness(business, button) {
  button.disabled = true;
  try {
    await api("/api/leads", {
      method: "POST",
      body: JSON.stringify({
        sourceId: business.sourceId,
        businessName: business.businessName,
        category: business.category,
        area: "Mzuzu",
        phone: business.phone,
        email: business.email,
        website: business.website,
        address: business.address,
        openingHours: business.openingHours,
        sourceUrl: business.sourceUrl,
        service: business.recommendation.service,
        opportunityReason: business.recommendation.reason,
        stage: "New",
        notes: `Found in OpenStreetMap. Verify details before contacting. Source: ${business.sourceUrl}`
      })
    });
    message(`${business.businessName} added to leads. Contact permission has not been recorded.`);
    await loadAll();
    renderDiscoveryResults();
  } catch (err) {
    button.disabled = false;
    message(err.message, true);
  }
}
$("leadForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("leadId").value;
  const body = {};
  for (const key of ["businessName","category","area","phone","email","website","service","stage","permissionSource","followUpDate","notes"]) body[key] = $(key).value.trim();
  body.contactPermission = $("contactPermission").checked;
  try {
    await api(id ? `/api/leads/${encodeURIComponent(id)}` : "/api/leads", { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
    $("leadFormPanel").classList.add("hidden"); clearForm(); message("Lead saved."); await loadAll();
  } catch (err) { message(err.message, true); }
});
let contactGuideLead = null;
function openContactGuide(lead) {
  contactGuideLead = lead;
  $("contactLeadName").textContent = lead.businessName;
  $("contactRecommendation").textContent = lead.opportunityReason
    ? `Suggested service: ${lead.service}. ${lead.opportunityReason}`
    : `Suggested service: ${lead.service || "Review the business's needs first"}. Confirm the business's needs before making a recommendation.`;
  const details = $("contactDetails");
  details.replaceChildren();
  for (const [label, value, href] of [
    ["Phone", lead.phone, lead.phone ? `tel:${lead.phone.replace(/[^\d+]/g, "")}` : ""],
    ["Email", lead.email, lead.email ? `mailto:${lead.email}` : ""],
    ["Website", lead.website, lead.website],
    ["Address", lead.address, ""],
    ["Opening hours", lead.openingHours, ""],
    ["Source listing", lead.sourceUrl, lead.sourceUrl]
  ]) {
    if (!value) continue;
    const row = document.createElement("p");
    row.className = "small";
    const labelNode = document.createElement("strong");
    labelNode.textContent = `${label}: `;
    row.append(labelNode);
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      if (href.startsWith("http")) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      link.textContent = value;
      row.append(link);
    } else {
      row.append(document.createTextNode(value));
    }
    details.append(row);
  }
  $("contactDraftChannel").value = lead.email ? "email" : "conversation";
  $("copyDraftStatus").textContent = "";
  updateContactDraft();
  $("contactGuideDialog").showModal();
}
function updateContactDraft() {
  if (!contactGuideLead) return;
  const lead = contactGuideLead;
  const service = lead.service || "digital services";
  const businessType = lead.category && lead.category !== "Other" ? `a ${lead.category.toLowerCase()} business` : "a local business";
  const drafts = {
    email: `Subject: Digital support for ${lead.businessName}\n\nHello ${lead.businessName},\n\nI’m [your name] from Mzuzu Connect, a local digital services business. We offer ${service.toLowerCase()} for businesses in Malawi.\n\nI found your business in a public directory and understand you are ${businessType} — please correct me if that is not right. I do not want to assume what you need. Would you be open to a brief conversation or to receiving a short overview?\n\nIf this is not relevant, please let me know and I will not follow up.\n\nRegards,\n[your name]\nMzuzu Connect\nhttps://mzuzuconnect.netlify.app\nfixmzuzu@gmail.com | +265 993 661 065`,
    conversation: `Hello, I’m [your name] from Mzuzu Connect in Mzuzu. We help local businesses with ${service.toLowerCase()}.\n\nI found your business in a public directory and understand you are ${businessType} — please correct me if that is not right. Who handles this area for your business, and would they be open to a short conversation about how you currently handle it?\n\nIf it is not relevant, no problem — I will not follow up.`,
    whatsapp: `Use this only after the business has explicitly agreed to receive WhatsApp messages, and send through the approved WhatsApp template.\n\nHello ${lead.businessName}, thank you for agreeing to receive information from Mzuzu Connect. We offer ${service.toLowerCase()} for businesses in Malawi. Would you like us to share a short overview? Reply STOP if you do not want further messages.`
  };
  $("contactDraft").value = drafts[$("contactDraftChannel").value];
}
$("contactDraftChannel").addEventListener("change", updateContactDraft);
$("closeContactGuideBtn").addEventListener("click", () => $("contactGuideDialog").close());
$("copyContactDraftBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("contactDraft").value);
    $("copyDraftStatus").textContent = "Draft copied. Review and personalize it before use.";
  } catch (err) {
    $("copyDraftStatus").textContent = `Could not copy automatically: ${err.message}`;
  }
});
async function send(lead, channel) {
  if (!lead.contactPermission || !lead.permissionSource || lead.optedOut) {
    alert("Sending blocked. Record genuine permission and its source first, and ensure the lead has not opted out."); return;
  }
  const explanation = channel === "whatsapp"
    ? "This uses your configured WhatsApp Cloud API approved template. Continue?"
    : "This sends a personalized business email using your configured SMTP account. Continue?";
  if (!confirm(`${explanation}\n\nBusiness: ${lead.businessName}\nService: ${lead.service}`)) return;
  try { const result = await api(`/api/leads/${encodeURIComponent(lead.id)}/send`, { method:"POST", body:JSON.stringify({channel}) }); message(result.message); await loadAll(); }
  catch (err) { message(err.message, true); }
}
async function optOut(lead) {
  if (!confirm(`Mark ${lead.businessName} as DO NOT CONTACT? Future sending will be blocked.`)) return;
  try { await api(`/api/leads/${encodeURIComponent(lead.id)}/opt-out`, { method:"POST", body:"{}" }); message("Lead suppressed from future outreach."); await loadAll(); }
  catch (err) { message(err.message, true); }
}
async function removeLead(lead) {
  if (!confirm(`Delete ${lead.businessName}? Consider using Do not contact instead so suppression is preserved.`)) return;
  try { await api(`/api/leads/${encodeURIComponent(lead.id)}`, { method:"DELETE" }); message("Lead deleted."); await loadAll(); }
  catch (err) { message(err.message, true); }
}
