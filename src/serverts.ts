import { config as loadEnv } from 'dotenv';
loadEnv();
loadEnv({ path: '.env.local', override: true });

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import mysql from 'mysql2/promise';
import * as pdfParse from "pdf-parse";
import mammoth from 'mammoth';

const JWT_SECRET = process.env.JWT_SECRET || 'hr-recruitment-secret-key';

// --- Utilitaires de formatage ---

function normalizeWhitespace(text: string) {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateText(text: string, maxChars: number) {
  const t = normalizeWhitespace(text);
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(0, maxChars - 20)).trimEnd()}\n\n[TRUNCATED]`;
}

// --- Logique IA Locale (Ollama + Llama 3) ---

async function localLlamaChatJson(userPrompt: string): Promise<string> {
  const OLLAMA_API = "http://localhost:11434/api/chat";
  
  try {
    const res = await fetch(OLLAMA_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        messages: [
          { 
            role: "system", 
            content: "You are an expert HR assistant. You must respond ONLY with a valid JSON object. No conversation, no markdown code blocks, just the raw JSON." 
          },
          { role: "user", content: userPrompt }
        ],
        stream: false,
        format: "json", // Force le mode JSON sur Ollama
        options: {
          temperature: 0.1, // Basse pour plus de constance
          num_ctx: 4096     // Fenêtre de contexte
        }
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Ollama Error ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    return data.message?.content || "";
  } catch (error) {
    console.error("Local AI Error:", error);
    throw error;
  }
}

function buildCvScoringPrompt(args: {
  jobTitle: string;
  jobDescription: string;
  jobSkills: string;
  cvText: string;
}) {
  return [
    'Return ONLY valid JSON. Required format:',
    '{',
    '  "score": number,',
    '  "matched_skills": string[],',
    '  "missing_skills": string[],',
    '  "experience_match": string,',
    '  "education_match": string,',
    '  "summary": string,',
    '  "recommendation": "strong_yes" | "yes" | "maybe" | "no"',
    '}',
    '',
    'JOB DATA:',
    `Title: ${args.jobTitle}`,
    `Description: ${args.jobDescription}`,
    `Skills: ${args.jobSkills}`,
    '',
    'CANDIDATE CV:',
    args.cvText,
  ].join('\n');
}

// --- Serveur Principal ---

async function startServer() {
  const app = express();
  const PORT = 3000;

  // MySQL Connection
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'password',
    database: process.env.MYSQL_DATABASE || 'hr_recruitment',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
  });

  // Database setup (Tables identiques au code d'origine)
  await db.execute(`CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255) UNIQUE, password VARCHAR(255), role VARCHAR(50), name VARCHAR(255))`);
  await db.execute(`CREATE TABLE IF NOT EXISTS jobs (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255), description TEXT, skills TEXT, experience VARCHAR(255), education VARCHAR(255), location VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS cvs (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, filename VARCHAR(255), extracted_text LONGTEXT, FOREIGN KEY(user_id) REFERENCES users(id))`);
  await db.execute(`CREATE TABLE IF NOT EXISTS applications (id INT AUTO_INCREMENT PRIMARY KEY, job_id INT, cv_id INT, user_id INT, score INT, analysis JSON, status VARCHAR(50) DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY unique_app (user_id, job_id), FOREIGN KEY(job_id) REFERENCES jobs(id), FOREIGN KEY(cv_id) REFERENCES cvs(id), FOREIGN KEY(user_id) REFERENCES users(id))`);

  app.use(cors());
  app.use(express.json());
  const upload = multer({ storage: multer.memoryStorage() });

  // Middleware Auth
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };

  // --- Routes ---

  app.post('/api/auth/register', async (req, res) => {
    const { email, password, role, name } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
      await db.execute('INSERT INTO users (email, password, role, name) VALUES (?, ?, ?, ?)', [email, hashedPassword, role, name]);
      res.status(201).json({ message: 'User registered' });
    } catch (e) {
      res.status(400).json({ error: 'Email already exists' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const [rows]: any = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
      res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  app.get('/api/jobs', async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM jobs ORDER BY created_at DESC');
    res.json(rows);
  });

  app.post('/api/jobs', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'recruiter') return res.sendStatus(403);
    const { title, description, skills, experience, education, location } = req.body;
    await db.execute('INSERT INTO jobs (title, description, skills, experience, education, location) VALUES (?, ?, ?, ?, ?, ?)', [title, description, skills, experience, education, location]);
    res.status(201).json({ message: 'Job created' });
  });

  app.post('/api/applications/apply', authenticateToken, upload.single('cv'), async (req, res) => {
    const { jobId } = req.body;
    const userId = req.user.id;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No CV uploaded' });

    // Analyse de fichier
    let extractedText = '';
    try {
      if (file.mimetype === 'application/pdf') {
        const data = await (pdfParse as any)(file.buffer);
        extractedText = data.text;
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const data = await mammoth.extractRawText({ buffer: file.buffer });
        extractedText = data.value;
      } else {
        return res.status(400).json({ error: 'Format non supporté' });
      }
    } catch (e) {
      return res.status(500).json({ error: 'Erreur lecture fichier' });
    }

    // Sauvegarde CV
    const [cvRes]: any = await db.execute('INSERT INTO cvs (user_id, filename, extracted_text) VALUES (?, ?, ?)', [userId, file.originalname, extractedText]);
    const cvId = cvRes.insertId;

    // Récupération Job
    const [jobRows]: any = await db.execute('SELECT * FROM jobs WHERE id = ?', [jobId]);
    const job = jobRows[0];

    // IA Analyse
    const prompt = buildCvScoringPrompt({
      jobTitle: String(job?.title || ''),
      jobDescription: truncateText(String(job?.description || ''), 1500),
      jobSkills: String(job?.skills || ''),
      cvText: truncateText(extractedText, 5000),
    });

    try {
      const rawResponse = await localLlamaChatJson(prompt);
      // Nettoyage au cas où Llama ajoute des balises ```json
      const cleanJson = rawResponse.replace(/```json\n?|\n?```/g, '').trim();
      const analysis = JSON.parse(cleanJson);

      await db.execute('INSERT INTO applications (job_id, cv_id, user_id, score, analysis) VALUES (?, ?, ?, ?, ?)', 
        [jobId, cvId, userId, analysis.score || 0, JSON.stringify(analysis)]);

      res.json({ message: 'Candidature envoyée', analysis });
    } catch (err) {
      console.error("Analyse failed:", err);
      res.status(500).json({ error: "L'IA locale n'a pas pu traiter le CV." });
    }
  });

  // ... (Garder les autres routes GET applications / PATCH status identiques)

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (_, res) => res.sendFile(path.join(process.cwd(), 'dist', 'index.html')));
  }

  app.listen(PORT, () => console.log(`🚀 Serveur Llama 3 local actif sur http://localhost:${PORT}`));
}

startServer();



