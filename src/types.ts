export type Role = 'admin' | 'recruiter' | 'candidate';

export interface User {
  id: number;
  email: string;
  role: Role;
  name: string;
}

export interface Job {
  id: number;
  title: string;
  description: string;
  skills: string;
  experience: string;
  education: string;
  location: string;
  created_at: string;
}

export interface AIAnalysis {
  score: number;
  matched_skills: string[];
  missing_skills: string[];
  experience_match: string;
  education_match: string;
  summary: string;
  recommendation: string;
}

export interface Application {
  id: number;
  job_id: number;
  cv_id: number;
  user_id: number;
  score: number;
  analysis: AIAnalysis;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  job_title: string;
  candidate_name: string;
  candidate_email?: string;
  cv_filename: string;
}
