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
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import mammoth from 'mammoth';

const JWT_SECRET = process.env.JWT_SECRET || 'hr-recruitment-secret-key';

//const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

type OpenRouterChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};


/**
 * Token/cost guardrails
 *
 * OpenRouter will reject requests when the (prompt tokens + max_tokens) exceeds
 * the available allowance for your key/credits. We keep responses short and
 * aggressively trim long inputs (CV/job text) to make the system stable/cheap.
 *
 * NOTE: This is a heuristic estimator. Exact tokenization depends on the model.
 */
const OR_MAX_OUTPUT_TOKENS_DEFAULT = 600; // safe, cheap; enough for small JSON
const OR_MAX_OUTPUT_TOKENS_MIN = 300;
const OR_MAX_OUTPUT_TOKENS_MAX = 1000;
const OR_MAX_EST_TOTAL_TOKENS = 5500; // keep below the ~5300-available class of failures

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function estimateTokensFromText(text: string) {
  // Rough rule-of-thumb for English: ~4 chars/token. Add a small buffer.
  return Math.ceil((text?.length || 0) / 4) + 16;
}

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

function getOpenRouterMaxTokens() {
  const fromEnv = Number.parseInt(process.env.OPENROUTER_MAX_TOKENS || '', 10);
  const requested = Number.isFinite(fromEnv) ? fromEnv : OR_MAX_OUTPUT_TOKENS_DEFAULT;
  return clampInt(requested, OR_MAX_OUTPUT_TOKENS_MIN, OR_MAX_OUTPUT_TOKENS_MAX);
}

// --- Logique IA Locale (Ollama + Llama 3) ---

async function localLlamaChatJson(userPrompt: string): Promise<string> {
  const OLLAMA_API = "http://localhost:11434/api/chat";
  
  try {
    const res = await fetch(OLLAMA_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2:3b ",
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
  // Keep the instructions tight: short JSON fields only, no long paragraphs.
  return [
    'You are an ATS/HR scoring function.',
    'Return ONLY valid JSON. No markdown. No extra keys.',
    '',
    'Schema:',
    '{',
    '  "score": number,                     // integer 0-100',
    '  "matched_skills": string[],          // max 12 items',
    '  "missing_skills": string[],          // max 12 items',
    '  "experience_match": string,          // <= 25 words',
    '  "education_match": string,           // <= 25 words',
    '  "summary": string,                   // <= 40 words',
    '  "recommendation": string             // one of: "strong_yes" | "yes" | "maybe" | "no"',
    '}',
    '',
    'Rules:',
    '- Keep strings concise. No paragraphs.',
    '- If unsure, be conservative.',
    '',
    'JOB OFFER:',
    `Title: ${args.jobTitle}`,
    `Description: ${args.jobDescription}`,
    `Required Skills: ${args.jobSkills}`,
    '',
    'CV TEXT:',
    args.cvText,
  ].join('\n');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // MySQL Connection
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'rootroot',
    database: process.env.MYSQL_DATABASE || 'hr_recruitmentdb',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
  });

  // Initialize Tables
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      password VARCHAR(255),
      role VARCHAR(50),
      name VARCHAR(255)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255),
      description TEXT,
      skills TEXT,
      experience VARCHAR(255),
      education VARCHAR(255),
      location VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS cvs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      filename VARCHAR(255),
      extracted_text LONGTEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      job_id INT,
      cv_id INT,
      user_id INT,
      score INT,
      analysis JSON,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_app (user_id, job_id),
      FOREIGN KEY(job_id) REFERENCES jobs(id),
      FOREIGN KEY(cv_id) REFERENCES cvs(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  app.use(cors());
  app.use(express.json());

  const upload = multer({ storage: multer.memoryStorage() });

  // Auth Middleware
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

  // --- API Routes ---

  // Auth
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

  // Jobs
  app.get('/api/jobs', async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM jobs ORDER BY created_at DESC');
    res.json(rows);
  });

  app.post('/api/jobs', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'recruiter') return res.sendStatus(403);
    const { title, description, skills, experience, education, location } = req.body;
    await db.execute('INSERT INTO jobs (title, description, skills, experience, education, location) VALUES (?, ?, ?, ?, ?, ?)', 
      [title, description, skills, experience, education, location]);
    res.status(201).json({ message: 'Job created' });
  });

  // CV Upload & Analysis
  app.post('/api/applications/apply', authenticateToken, upload.single('cv'), async (req, res) => {
    const { jobId } = req.body;
    const userId = req.user.id;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No CV uploaded' });

    // Prevent duplicate applications
    const [existing]: any = await db.execute('SELECT id FROM applications WHERE user_id = ? AND job_id = ?', [userId, jobId]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'You have already applied for this job' });
    }

    let extractedText = ''; 

    try {
      if (file.mimetype === 'application/pdf') {
        // Avec require, 'pdf' est directement la fonction de parsing
        const data = typeof pdf === 'function' ? pdf : (pdf.default || pdf);        
        // On récupère le texte directement
        extractedText = data.text || ''; 
    
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const data = await mammoth.extractRawText({ buffer: file.buffer });
        extractedText = data.value;
      } else {
        return res.status(400).json({ error: 'Format non supporté (PDF ou DOCX uniquement)' });
      }
    } catch (parseError: any) {
      console.error('File parsing error:', parseError);
      return res.status(500).json({ 
        error: 'Failed to extract text from CV', 
        details: parseError.message 
      });
    }

    // Save CV
    const [cvResult]: any = await db.execute('INSERT INTO cvs (user_id, filename, extracted_text) VALUES (?, ?, ?)', 
      [userId, file.originalname, extractedText]);
    const cvId = cvResult.insertId;

    // Get Job Info for AI
    const [jobRows]: any = await db.execute('SELECT * FROM jobs WHERE id = ?', [jobId]);
    const job = jobRows[0];

    // Input trimming to control token usage / cost.
    // CVs can be very long (multiple pages), and job descriptions can be verbose.
    // We keep enough signal for scoring while staying within stable token budgets.
    const jobTitle = truncateText(String(job?.title || ''), 200);
    const jobDescription = truncateText(String(job?.description || ''), 2000);
    const jobSkills = truncateText(String(job?.skills || ''), 800);
    const cvText = truncateText(extractedText, 8000);

    const prompt = buildCvScoringPrompt({
      jobTitle,
      jobDescription,
      jobSkills,
      cvText,
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

  // Get applications for a specific job
  app.get('/api/applications/job/:jobId', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'recruiter') return res.sendStatus(403);
    
    const [rows]: any = await db.execute(`
      SELECT a.*, u.name as candidate_name, u.email as candidate_email, c.filename as cv_filename
      FROM applications a
      JOIN users u ON a.user_id = u.id
      JOIN cvs c ON a.cv_id = c.id
      WHERE a.job_id = ?
      ORDER BY a.score DESC
    `, [req.params.jobId]);
    
    res.json(rows.map((app: any) => ({ ...app, analysis: typeof app.analysis === 'string' ? JSON.parse(app.analysis) : app.analysis })));
  });

  // Get all applications (with role-based filtering)
  app.get('/api/applications', authenticateToken, async (req, res) => {
    let query = `
      SELECT a.*, j.title as job_title, u.name as candidate_name, c.filename as cv_filename
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      JOIN users u ON a.user_id = u.id
      JOIN cvs c ON a.cv_id = c.id
    `;
    
    const params = [];
    if (req.user.role === 'candidate') {
      query += ` WHERE a.user_id = ?`;
      params.push(req.user.id);
    }
    
    query += ' ORDER BY a.score DESC';
    const [rows]: any = await db.execute(query, params);
    res.json(rows.map((app: any) => ({ ...app, analysis: typeof app.analysis === 'string' ? JSON.parse(app.analysis) : app.analysis })));
  });

  app.patch('/api/applications/:id/status', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'recruiter') return res.sendStatus(403);
    const { status } = req.body;
    await db.execute('UPDATE applications SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Status updated' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
