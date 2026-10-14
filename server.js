const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const fs = require("fs");
const nodemailer = require("nodemailer");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
const LOG_FILE = path.join(DATA_DIR, "activity.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}
function leads() { return readJson(LEADS_FILE, []); }
function saveLeads(items) { writeJson(LEADS_FILE, items); }
function logActivity(item) {
  const logs = readJson(LOG_FILE, []);
  logs.unshift({ id: Date.now().toString(), at: new Date().toISOString(), ...item });
  writeJson(LOG_FILE, logs.slice(0, 1000));
}
function safeText(value, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}
function auth(req, res, next) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(503).json({ error: "Set ADMIN_PASSWORD in .env before using the dashboard." });
  if (req.headers["x-admin-password"] !== expected) return res.status(401).json({ error: "Please log in again." });
  next();
}
function isAllowed(lead) {
  return lead.contactPermission === true &&
    Boolean(safeText(lead.permissionSource, 250)) &&
    lead.optedOut !== true &&
    lead.stage !== "Do not contact";
}
function normalizeLead(body, old = {}) {
  return {
    id: old.id || safeText(body.id, 80) || Date.now().toString(),
    sourceId: safeText(body.sourceId ?? old.sourceId, 100),
    businessName: safeText(body.businessName ?? old.businessName, 150),
    category: safeText(body.category ?? old.category, 100),
    area: safeText(body.area ?? old.area ?? "Mzuzu", 100) || "Mzuzu",
    phone: safeText(body.phone ?? old.phone, 50),
    email: safeText(body.email ?? old.email, 180),
    website: safeText(body.website ?? old.website, 300),
    address: safeText(body.address ?? old.address, 250),
    openingHours: safeText(body.openingHours ?? old.openingHours, 150),
    sourceUrl: safeText(body.sourceUrl ?? old.sourceUrl, 300),
    service: safeText(body.service ?? old.service, 120),
    opportunityReason: safeText(body.opportunityReason ?? old.opportunityReason, 500),
    notes: safeText(body.notes ?? old.notes, 1000),
    stage: safeText(body.stage ?? old.stage ?? "New", 50) || "New",
    contactPermission: body.contactPermission === undefined ? Boolean(old.contactPermission) : body.contactPermission === true,
    permissionSource: safeText(body.permissionSource ?? old.permissionSource, 250),
    optedOut: body.optedOut === undefined ? Boolean(old.optedOut) : body.optedOut === true,
    followUpDate: safeText(body.followUpDate ?? old.followUpDate, 30),
    createdAt: old.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
function makeMessage(lead) {
  return `Hello ${lead.businessName}, I'm contacting you from Mzuzu Connect. We help businesses with ${lead.service || "websites and business systems"}. If this is relevant, may I share a short demo and quotation? If you don't want further messages, reply STOP.`;
}

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "Mzuzu Connect Client Acquisition" }));
app.post("/api/login", (req, res) => {
  if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ error: "Set ADMIN_PASSWORD in the .env file next to server.js, then restart the app." });
  if (typeof req.body?.password !== "string" || req.body.password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: "Incorrect password." });
  res.json({ ok: true });
});

app.use("/api", (req, res, next) => {
  if (req.path === "/login" || req.path === "/health") return next();
  return auth(req, res, next);
});

function whatsappConfigurationStatus() {
  const missing = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TEMPLATE_NAME"]
    .filter(name => !process.env[name]);
  return { configured: missing.length === 0, missing };
}

app.get("/api/outreach-status", (_req, res) => {
  res.json({ whatsapp: whatsappConfigurationStatus() });
});

const discoveryFilters = {
  all: [
    '["shop"]',
    '["amenity"~"^(restaurant|cafe|fast_food|bar|food_court|pharmacy|bank|clinic|hospital|fuel|marketplace)$"]',
    '["office"]["office"!="government"]',
    '["craft"]',
    '["tourism"~"^(hotel|guest_house|hostel)$"]'
  ],
  food: ['["amenity"~"^(restaurant|cafe|fast_food|bar|food_court)$"]'],
  retail: ['["shop"]'],
  services: ['["office"]["office"!="government"]', '["craft"]', '["amenity"~"^(pharmacy|bank|clinic|hospital|fuel)$"]'],
  accommodation: ['["tourism"~"^(hotel|guest_house|hostel)$"]']
};
const MZUZU_LAT = -11.4656;
const MZUZU_LON = 34.0207;
const MZUZU_RADIUS_METERS = 10000;
function recommendService(tags, hasWebsite) {
  if (!hasWebsite) {
    return {
      service: "Website Development",
      reason: "No website is listed in this OpenStreetMap record. Verify the business's online presence before suggesting a website."
    };
  }
  if (tags.tourism || ["restaurant", "cafe", "fast_food", "food_court"].includes(tags.amenity)) {
    return {
      service: "E-commerce Solutions",
      reason: "This accommodation or food listing may suit online menus, enquiries, or bookings. Check what the business already uses first."
    };
  }
  if (tags.shop || tags.amenity === "pharmacy") {
    return {
      service: "Software Systems",
      reason: "Retail businesses may benefit from sales or stock tracking. Ask about their current process before recommending a system."
    };
  }
  return {
    service: "Digital Marketing & SEO",
    reason: "A website is listed, so a review of search visibility and digital marketing may be relevant. Check their current needs before proposing work."
  };
}
app.get("/api/discover", async (req, res) => {
  const category = safeText(req.query.category, 30) || "all";
  const filters = discoveryFilters[category];
  if (!filters) return res.status(400).json({ error: "Choose a valid business category." });

  const selectors = filters.map(filter =>
    `nwr(around:${MZUZU_RADIUS_METERS},${MZUZU_LAT},${MZUZU_LON})[name]${filter};`
  ).join("\n");
  const query = `[out:json][timeout:25];\n(\n${selectors}\n);\nout center tags 100;`;

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "MzuzuConnect/1.0 (business discovery)"
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) {
      return res.status(502).json({ error: `OpenStreetMap search is temporarily unavailable (HTTP ${response.status}). Please try again later.` });
    }

    const data = await response.json();
    const results = (Array.isArray(data.elements) ? data.elements : [])
      .filter(element => element.tags && typeof element.tags.name === "string")
      .map(element => {
        const tags = element.tags;
        let businessCategory = "Other";
        if (tags.shop) businessCategory = "Retail shop";
        else if (tags.amenity === "restaurant" || tags.amenity === "cafe" || tags.amenity === "fast_food" || tags.amenity === "bar" || tags.amenity === "food_court") businessCategory = "Restaurant";
        else if (tags.tourism) businessCategory = "Lodge / guest house";
        else if (tags.amenity === "pharmacy") businessCategory = "Pharmacy";
        else if (tags.craft) businessCategory = "Furniture business";
        else if (tags.office || tags.amenity) businessCategory = "Other";

        let website = "";
        const websiteValue = tags.website || tags["contact:website"];
        if (typeof websiteValue === "string") {
          try {
            const parsed = new URL(websiteValue.startsWith("http") ? websiteValue : `https://${websiteValue}`);
            if (parsed.protocol === "http:" || parsed.protocol === "https:") website = parsed.href;
          } catch {
            website = "";
          }
        }

        const address = tags["addr:full"] || [
          tags["addr:housenumber"],
          tags["addr:street"],
          tags["addr:suburb"] || tags["addr:quarter"],
          tags["addr:city"]
        ].filter(Boolean).join(", ");
        const recommendation = recommendService(tags, Boolean(website));
        return {
          sourceId: `osm:${element.type}:${element.id}`,
          businessName: safeText(tags.name, 150),
          category: businessCategory,
          phone: safeText(tags.phone || tags["contact:phone"] || tags["phone:mobile"], 50),
          email: safeText(tags.email || tags["contact:email"], 180),
          website,
          address: safeText(address, 250),
          openingHours: safeText(tags.opening_hours, 150),
          sourceUrl: `https://www.openstreetmap.org/${encodeURIComponent(element.type)}/${encodeURIComponent(element.id)}`,
          mapUrl: `https://www.openstreetmap.org/${encodeURIComponent(element.type)}/${encodeURIComponent(element.id)}`,
          details: [tags.shop, tags.amenity, tags.office, tags.craft, tags.tourism].filter(Boolean).join(", "),
          recommendation
        };
      });
    res.json(results);
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res.status(504).json({ error: "OpenStreetMap search timed out. Please try again later." });
    }
    console.error("OpenStreetMap discovery failed:", error);
    res.status(502).json({ error: "Could not complete the OpenStreetMap search. Check your internet connection and try again." });
  }
});

app.get("/api/leads", (_req, res) => {
  const all = leads().sort((a,b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  res.json(all);
});
app.post("/api/leads", (req, res) => {
  const item = normalizeLead(req.body);
  if (!item.businessName) return res.status(400).json({ error: "Business name is required." });
  if (item.area && !/mzuzu/i.test(item.area)) return res.status(400).json({ error: "This workspace is configured for Mzuzu only." });
  const all = leads();
  const duplicate = all.find(x =>
    (item.sourceId && x.sourceId === item.sourceId) ||
    (item.phone && x.phone === item.phone) ||
    (item.email && x.email.toLowerCase() === item.email.toLowerCase())
  );
  if (duplicate) return res.status(409).json({ error: "This business is already in your leads." });
  all.push(item); saveLeads(all); logActivity({ action: "lead_created", leadId: item.id, businessName: item.businessName });
  res.status(201).json(item);
});
app.put("/api/leads/:id", (req, res) => {
  const all = leads(); const index = all.findIndex(x => x.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Lead not found." });
  const item = normalizeLead(req.body, all[index]);
  if (item.area && !/mzuzu/i.test(item.area)) return res.status(400).json({ error: "This workspace is configured for Mzuzu only." });
  all[index] = item; saveLeads(all);
  logActivity({ action: "lead_updated", leadId: item.id, businessName: item.businessName });
  res.json(item);
});
app.delete("/api/leads/:id", (req, res) => {
  const all = leads(); const item = all.find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Lead not found." });
  saveLeads(all.filter(x => x.id !== req.params.id));
  logActivity({ action: "lead_deleted", leadId: item.id, businessName: item.businessName });
  res.json({ ok: true });
});
app.get("/api/activity", (_req, res) => res.json(readJson(LOG_FILE, [])));

app.get("/api/export.csv", (_req, res) => {
  const columns = ["businessName","category","area","address","phone","email","website","openingHours","sourceUrl","service","opportunityReason","stage","contactPermission","permissionSource","optedOut","followUpDate","notes"];
  const quote = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [columns.join(","), ...leads().map(l => columns.map(c => quote(l[c])).join(","))].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=mzuzu-connect-leads.csv");
  res.send(csv);
});

async function sendEmail(lead, message) {
  const required = ["SMTP_HOST","SMTP_USER","SMTP_PASSWORD","EMAIL_FROM"];
  if (required.some(k => !process.env[k])) throw new Error("Email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM.");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
  });
  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: lead.email,
    subject: `A business website/system idea for ${lead.businessName}`,
    text: message
  });
}
async function sendWhatsAppTemplate(lead) {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
  if (!whatsappConfigurationStatus().configured) {
    throw new Error("WhatsApp is not configured. Set Cloud API token, phone number ID and approved template name.");
  }
  if (!lead.phone) throw new Error("This lead has no phone number.");
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  const url = `https://graph.facebook.com/${version}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: lead.phone.replace(/[^\d]/g, ""),
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE_NAME,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en" },
        components: [{ type: "body", parameters: [
          { type: "text", text: lead.businessName },
          { type: "text", text: lead.service || "websites and business systems" }
        ]}]
      }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `WhatsApp API error (${response.status}). Check template parameters and API credentials.`);
  return data;
}
app.post("/api/leads/:id/send", async (req, res) => {
  const all = leads(); const index = all.findIndex(x => x.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Lead not found." });
  const lead = all[index];
  if (!isAllowed(lead)) return res.status(403).json({ error: "Sending blocked: record actual permission and its source, and ensure the lead has not opted out." });
  const channel = req.body.channel;
  try {
    let result;
    if (channel === "email") {
      if (!lead.email) return res.status(400).json({ error: "This lead has no email address." });
      result = await sendEmail(lead, makeMessage(lead));
    } else if (channel === "whatsapp") {
      result = await sendWhatsAppTemplate(lead);
    } else {
      return res.status(400).json({ error: "Choose email or whatsapp." });
    }
    lead.stage = "Contacted"; lead.updatedAt = new Date().toISOString();
    saveLeads(all);
    logActivity({ action: "message_sent", channel, leadId: lead.id, businessName: lead.businessName, resultId: result?.messageId || result?.messages?.[0]?.id || null });
    res.json({ ok: true, message: `${channel} request accepted by the configured provider.` });
  } catch (error) {
    logActivity({ action: "message_failed", channel, leadId: lead.id, businessName: lead.businessName, error: error.message });
    res.status(502).json({ error: error.message });
  }
});
app.post("/api/leads/:id/opt-out", (req, res) => {
  const all = leads(); const item = all.find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Lead not found." });
  item.optedOut = true; item.stage = "Do not contact"; item.updatedAt = new Date().toISOString();
  saveLeads(all); logActivity({ action: "opt_out", leadId: item.id, businessName: item.businessName });
  res.json({ ok: true, message: "Lead suppressed from future sending." });
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.listen(PORT, () => console.log(`Mzuzu Connect Client Acquisition running on port ${PORT}`));
