require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const db = require("./database");
const { authMiddleware, generateToken } = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: "*", methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"], allowedHeaders: ["Content-Type","Authorization"] }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.post("/api/auth/register", (req, res) => {
  const { email, password, name, barbershop_name } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email e senha são obrigatórios" });
  try {
    if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) return res.status(400).json({ error: "Email já cadastrado" });
    const publicId = Math.random().toString(36).substring(2, 12);
    const shop = db.prepare("INSERT INTO barbershops (name, public_id) VALUES (?, ?) RETURNING *").get(barbershop_name || "Minha Barbearia", publicId);
    const hash = bcrypt.hashSync(password, 10);
    const user = db.prepare("INSERT INTO users (barbershop_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'owner') RETURNING id, email, name, barbershop_id").get(shop.id, email, hash, name || "");
    const token = generateToken({ userId: user.id, barbershopId: shop.id, email });
    res.status(201).json({ token, access_token: token, user: { id: user.id, email, name, barbershopId: shop.id } });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erro interno" }); }
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email e senha são obrigatórios" });
  try {
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: "Credenciais inválidas" });
    const token = generateToken({ userId: user.id, barbershopId: user.barbershop_id, email });
    res.json({ token, access_token: token, user: { id: user.id, email: user.email, name: user.name, barbershopId: user.barbershop_id } });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erro interno" }); }
});

app.post("/api/auth/refresh", authMiddleware, (req, res) => {
  const token = generateToken({ userId: req.user.userId, barbershopId: req.user.barbershopId, email: req.user.email });
  res.json({ token, access_token: token });
});

app.get("/api/barbershops/:id/services", authMiddleware, (req, res) => {
  res.json(db.prepare("SELECT * FROM services WHERE barbershop_id = ? AND active = 1 ORDER BY created_at ASC").all(req.params.id));
});

app.post("/api/barbershops/:id/services", authMiddleware, (req, res) => {
  const { name, price_cents, duration_minutes } = req.body;
  if (!name) return res.status(400).json({ error: "Nome é obrigatório" });
  res.status(201).json(db.prepare("INSERT INTO services (barbershop_id, name, price_cents, duration_minutes) VALUES (?, ?, ?, ?) RETURNING *").get(req.params.id, name, price_cents || 0, duration_minutes || 30));
});

app.delete("/api/barbershops/:id/services/:serviceId", authMiddleware, (req, res) => {
  db.prepare("UPDATE services SET active = 0 WHERE id = ?").run(req.params.serviceId);
  res.json({ success: true });
});

app.get("/api/barbershops/:id/professionals", authMiddleware, (req, res) => {
  res.json(db.prepare("SELECT * FROM professionals WHERE barbershop_id = ? AND active = 1 ORDER BY created_at ASC").all(req.params.id));
});

app.post("/api/barbershops/:id/professionals", authMiddleware, (req, res) => {
  const { name, phone, specialties, working_days } = req.body;
  if (!name) return res.status(400).json({ error: "Nome é obrigatório" });
  res.status(201).json(db.prepare("INSERT INTO professionals (barbershop_id, name, phone, specialties, working_days) VALUES (?, ?, ?, ?, ?) RETURNING *").get(req.params.id, name, phone || null, specialties || null, working_days || "1,2,3,4,5"));
});

app.delete("/api/barbershops/:id/professionals/:proId", authMiddleware, (req, res) => {
  db.prepare("UPDATE professionals SET active = 0 WHERE id = ?").run(req.params.proId);
  res.json({ success: true });
});

app.get("/api/barbershops/:id/appointments", authMiddleware, (req, res) => {
  res.json(db.prepare(`SELECT a.*, s.name AS service_name, s.price_cents, p.name AS professional_name FROM appointments a LEFT JOIN services s ON a.service_id = s.id LEFT JOIN professionals p ON a.professional_id = p.id WHERE a.barbershop_id = ? ORDER BY a.scheduled_at DESC`).all(req.params.id));
});

app.post("/api/barbershops/:id/appointments", authMiddleware, (req, res) => {
  const { client_name, client_phone, service_id, professional_id, scheduled_at, status } = req.body;
  if (!client_name || !scheduled_at) return res.status(400).json({ error: "Nome e data são obrigatórios" });
  res.status(201).json(db.prepare("INSERT INTO appointments (barbershop_id, client_name, client_phone, service_id, professional_id, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *").get(req.params.id, client_name, client_phone || null, service_id || null, professional_id || null, scheduled_at, status || "pending"));
});

app.patch("/api/barbershops/:id/appointments/:appointmentId/status", authMiddleware, (req, res) => {
  const { status } = req.body;
  if (!["pending","confirmed","completed","canceled"].includes(status)) return res.status(400).json({ error: "Status inválido" });
  db.prepare("UPDATE appointments SET status = ? WHERE id = ?").run(status, req.params.appointmentId);
  res.json(db.prepare("SELECT * FROM appointments WHERE id = ?").get(req.params.appointmentId));
});

app.delete("/api/barbershops/:id/appointments/:appointmentId", authMiddleware, (req, res) => {
  db.prepare("UPDATE appointments SET status = 'canceled' WHERE id = ?").run(req.params.appointmentId);
  res.json({ success: true });
});

app.get("/api/barbershops/:id/appointments/slots/:proId", authMiddleware, (req, res) => {
  const allSlots = ["09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00"];
  if (!req.query.date) return res.json(allSlots);
  const occupied = db.prepare(`SELECT substr(scheduled_at, 12, 5) AS time_slot FROM appointments WHERE barbershop_id = ? AND professional_id = ? AND date(scheduled_
