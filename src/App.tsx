import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Briefcase, 
  FileText, 
  Users, 
  LogOut, 
  Plus, 
  Search, 
  CheckCircle, 
  XCircle, 
  Clock,
  TrendingUp,
  MapPin,
  GraduationCap,
  Award,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend,
  ArcElement
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import { cn } from './lib/utils';
import { User, Job, Application, Role } from './types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

// --- API Helper ---
const API_URL = '';

const api = {
  async get(endpoint: string, token?: string) {
    const res = await fetch(`${API_URL}/api${endpoint}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error('API Error');
    return res.json();
  },
  async post(endpoint: string, body: any, token?: string) {
    const res = await fetch(`${API_URL}/api${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('API Error');
    return res.json();
  },
  async postFile(endpoint: string, formData: FormData, token?: string) {
    const res = await fetch(`${API_URL}/api${endpoint}`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData
    });
    if (!res.ok) throw new Error('API Error');
    return res.json();
  },
  async patch(endpoint: string, body: any, token?: string) {
    const res = await fetch(`${API_URL}/api${endpoint}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('API Error');
    return res.json();
  }
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [view, setView] = useState<'dashboard' | 'jobs' | 'applications' | 'post-job'>('dashboard');
  const [pendingSelectedAppId, setPendingSelectedAppId] = useState<number | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  const syncFromHash = React.useCallback(() => {
    const raw = (window.location.hash || '').replace(/^#/, '');
    const route = raw.startsWith('/') ? raw : raw ? `/${raw}` : '/';
    const [path, query = ''] = route.split('?');
    const params = new URLSearchParams(query);
    const selectedAppId = params.get('selectedAppId');

    if (path === '/' || path === '/dashboard') {
      setView('dashboard');
      setPendingSelectedAppId(null);
      return;
    }
    if (path === '/jobs') {
      setView('jobs');
      setPendingSelectedAppId(null);
      return;
    }
    if (path === '/post-job') {
      setView('post-job');
      setPendingSelectedAppId(null);
      return;
    }
    if (path === '/candidates' || path === '/applications') {
      setView('applications');
      setPendingSelectedAppId(selectedAppId ? Number(selectedAppId) : null);
      return;
    }

    // Unknown route -> dashboard
    setView('dashboard');
    setPendingSelectedAppId(null);
  }, []);

  const navigateHash = React.useCallback((path: string, search?: Record<string, string | number | null | undefined>) => {
    const params = new URLSearchParams();
    if (search) {
      for (const [k, v] of Object.entries(search)) {
        if (v === null || v === undefined || v === '') continue;
        params.set(k, String(v));
      }
    }
    const next = `#${path}${params.toString() ? `?${params.toString()}` : ''}`;
    if (window.location.hash !== next) window.location.hash = next;
    // Ensure state updates even if hash doesn't change.
    syncFromHash();
  }, [syncFromHash]);

  // Auth State
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && token) {
      setUser(JSON.parse(savedUser));
    }
  }, [token]);

  useEffect(() => {
    syncFromHash();
    const onHashChange = () => syncFromHash();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [syncFromHash]);

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token, view]);

  const fetchData = async () => {
    try {
      const [jobsData, appsData] = await Promise.all([
        api.get('/jobs'),
        api.get('/applications', token!)
      ]);
      setJobs(jobsData);
      setApplications(appsData);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    window.location.hash = '#/dashboard';
  };

  if (!token) {
    return <AuthScreen onLogin={(t, u) => {
      setToken(t);
      setUser(u);
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
    }} mode={authMode} setMode={setAuthMode} />;
  }

  return (
    <div className="min-h-screen bg-bg-main flex font-sans text-text-main">
      {/* Sidebar */}
      <aside className="sleek-sidebar">
        <div className="p-8">
          <div className="flex items-center gap-2.5 text-primary font-extrabold text-xl tracking-tight">
            <Award className="w-6 h-6 stroke-[2.5]" />
            <span>TalentAI</span>
          </div>
        </div>

        <nav className="flex-1 px-4">
          <NavItem 
            active={view === 'dashboard'} 
            onClick={() => navigateHash('/dashboard')} 
            icon={<LayoutDashboard className="w-4 h-4" />} 
            label="Dashboard" 
          />
          <NavItem 
            active={view === 'jobs'} 
            onClick={() => navigateHash('/jobs')} 
            icon={<Briefcase className="w-4 h-4" />} 
            label="Job Offers" 
          />
          {user?.role !== 'candidate' && (
            <NavItem 
              active={view === 'applications'} 
              onClick={() => navigateHash('/candidates')} 
              icon={<Users className="w-4 h-4" />} 
              label="Candidate Pool" 
            />
          )}
          {user?.role === 'candidate' && (
            <NavItem 
              active={view === 'applications'} 
              onClick={() => navigateHash('/applications')} 
              icon={<FileText className="w-4 h-4" />} 
              label="My Applications" 
            />
          )}
        </nav>

        <div className="p-6 border-t border-border-main">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-text-muted font-bold">
              {user?.name?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{user?.name}</p>
              <p className="text-[11px] text-text-muted uppercase font-bold tracking-wider">{user?.role}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-text-muted hover:text-danger hover:bg-red-50 rounded-lg transition-colors text-xs font-bold uppercase tracking-wider"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="sleek-header">
          <div className="flex items-center gap-4">
            <span className="text-text-muted text-[13px] font-medium">Current View:</span>
            <span className="bg-slate-100 px-3 py-1 rounded-md text-[13px] font-semibold border border-border-main capitalize">
              {view.replace('-', ' ')}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {(user?.role === 'admin' || user?.role === 'recruiter') && view === 'jobs' && (
              <button 
                onClick={() => navigateHash('/post-job')}
                className="bg-primary text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Post New Job
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {view === 'dashboard' && (
              <DashboardView
                key="dashboard"
                user={user!}
                jobs={jobs}
                applications={applications}
                onScheduleInterview={(applicationId) => {
                  console.log('[UI] Schedule Interview clicked', { applicationId });
                  navigateHash('/candidates', { selectedAppId: applicationId });
                }}
              />
            )}
            {view === 'jobs' && (
              <JobsView
                key="jobs"
                user={user!}
                jobs={jobs}
                onApply={() => navigateHash(user?.role === 'candidate' ? '/applications' : '/candidates')}
                onManageCandidates={() => {
                  console.log('[UI] Manage Candidates clicked');
                  navigateHash('/candidates');
                }}
              />
            )}
            {view === 'applications' && (
              <ApplicationsView
                key="apps"
                user={user!}
                applications={applications}
                onRefresh={fetchData}
                initialSelectedAppId={pendingSelectedAppId}
                onInitialSelectedAppConsumed={() => navigateHash(user?.role === 'candidate' ? '/applications' : '/candidates')}
              />
            )}
            {view === 'post-job' && (
              <PostJobView key="post" onBack={() => navigateHash('/jobs')} onCreated={fetchData} token={token!} />
            )}
          </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      type="button"
      className={cn(
        "sleek-nav-item w-full",
        active 
          ? "sleek-nav-item-active" 
          : "sleek-nav-item-inactive"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// --- Views ---

function DashboardView({
  user,
  jobs,
  applications,
  onScheduleInterview,
}: {
  user: User,
  jobs: Job[],
  applications: Application[],
  onScheduleInterview: (applicationId: number) => void,
  key?: string
}) {
  const stats = [
    { label: 'Total Applications', value: applications.length, icon: <Users className="w-5 h-5" />, color: 'text-primary' },
    { label: 'Average Match', value: applications.length ? Math.round(applications.reduce((acc, a) => acc + a.score, 0) / applications.length) + '%' : '0%', icon: <TrendingUp className="w-5 h-5" />, color: 'text-success' },
    { label: 'Active Job Offers', value: jobs.length, icon: <Briefcase className="w-5 h-5" />, color: 'text-warning' },
    { label: 'Shortlisted', value: applications.filter(a => a.score >= 70).length, icon: <CheckCircle className="w-5 h-5" />, color: 'text-primary' },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat, i) => (
          <div key={i} className="sleek-card p-5 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="sleek-stat-label">{stat.label}</span>
              <div className={stat.color}>{stat.icon}</div>
            </div>
            <p className="sleek-stat-value">{stat.value}</p>
            {i === 0 && <p className="text-[11px] text-success font-bold mt-2">↑ 12% from last week</p>}
            {i === 1 && <p className="text-[11px] text-text-muted font-medium mt-2">Stable across {jobs.length} jobs</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 sleek-panel">
          <div className="px-5 py-4 border-b border-border-main flex justify-between items-center">
            <h3 className="text-base font-bold">Candidate Ranking</h3>
            <button className="text-[12px] text-primary font-bold hover:underline">View All Results</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="sleek-table-th">Candidate Name</th>
                  <th className="sleek-table-th">Match Score</th>
                  <th className="sleek-table-th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-main">
                {applications.slice(0, 5).map((app, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="sleek-table-td font-semibold">{app.candidate_name}</td>
                    <td className="sleek-table-td">
                      <div className="flex items-center">
                        <div className="sleek-progress-bg">
                          <div 
                            className={cn(
                              "sleek-progress-fill",
                              app.score >= 70 ? "bg-success" : app.score >= 40 ? "bg-warning" : "bg-danger"
                            )}
                            style={{ width: `${app.score}%` }}
                          />
                        </div>
                        <span className={cn(
                          "sleek-pill",
                          app.score >= 70 ? "sleek-pill-high" : app.score >= 40 ? "sleek-pill-mid" : "sleek-pill-low"
                        )}>
                          {app.score}%
                        </span>
                      </div>
                    </td>
                    <td className="sleek-table-td">
                      <span className={cn(
                        "flex items-center gap-1.5 font-medium",
                        app.status === 'accepted' ? "text-success" : app.status === 'rejected' ? "text-danger" : "text-text-muted"
                      )}>
                        <span className="text-[10px]">●</span>
                        {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sleek-panel">
          <div className="px-5 py-4 border-b border-border-main">
            <h3 className="text-base font-bold">AI Intelligence Summary</h3>
          </div>
          <div className="flex-1 flex flex-col">
            {applications.length > 0 ? (
              <>
                <div className="p-5 border-b border-border-main">
                  <p className="text-sm font-bold mb-2">Top Match: {applications[0].candidate_name}</p>
                  <p className="text-[12px] text-text-muted leading-relaxed">
                    {applications[0].analysis.summary.slice(0, 150)}...
                  </p>
                </div>
                <div className="p-5 border-b border-border-main">
                  <p className="sleek-stat-label mb-3">Matched Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {applications[0].analysis.matched_skills.slice(0, 5).map((s, i) => (
                      <span key={i} className="px-2 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded border border-emerald-100">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-5 bg-bg-main flex-1">
                  <p className="text-[12px] font-bold mb-2">AI Recommendation</p>
                  <p className="text-[13px] italic text-text-muted leading-relaxed">
                    "{applications[0].analysis.recommendation}"
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const topAppId = applications[0]?.id;
                      if (!topAppId) return;
                      onScheduleInterview(topAppId);
                    }}
                    className="w-full mt-6 py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors"
                  >
                    Schedule Interview
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-center">
                <p className="text-sm text-text-muted">No applications yet to analyze.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function JobsView({
  user,
  jobs,
  onApply,
  onManageCandidates,
}: {
  user: User,
  jobs: Job[],
  onApply: () => void,
  onManageCandidates: () => void,
  key?: string
}) {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !selectedJob) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('cv', file);
    formData.append('jobId', selectedJob.id.toString());

    try {
      const response = await api.postFile('/applications/apply', formData, localStorage.getItem('token')!);
      setAiResult(response.analysis);
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to submit application');
    } finally {
      setLoading(false);
    }
  };

  const closeModals = () => {
    setSelectedJob(null);
    setFile(null);
    setAiResult(null);
    if (aiResult) onApply();
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      {jobs.map((job) => (
        <div key={job.id} className="sleek-card p-6 flex flex-col">
          <div className="flex-1">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-text-main leading-tight">{job.title}</h3>
              <span className="bg-primary-light text-primary text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">New</span>
            </div>
            <div className="flex items-center gap-2 text-text-muted text-[13px] mb-4 font-medium">
              <MapPin className="w-3.5 h-3.5" />
              {job.location}
            </div>
            <p className="text-[13px] text-text-muted line-clamp-3 mb-5 leading-relaxed">{job.description}</p>
            <div className="flex flex-wrap gap-1.5 mb-6">
              {job.skills.split(',').map((skill, i) => (
                <span key={i} className="px-2 py-1 bg-slate-100 text-text-muted text-[10px] font-bold uppercase tracking-wider rounded border border-border-main">
                  {skill.trim()}
                </span>
              ))}
            </div>
          </div>
          {user.role === 'candidate' && (
            <button 
              onClick={() => setSelectedJob(job)}
              className="w-full bg-primary text-white py-3 rounded-lg text-sm font-bold hover:bg-blue-700 transition-all shadow-sm"
            >
              Apply for this Role
            </button>
          )}
          {(user.role === 'admin' || user.role === 'recruiter') && (
            <button 
              type="button"
              onClick={() => {
                console.log('[UI] Manage Candidates clicked', { jobId: job.id });
                onManageCandidates();
              }}
              className="w-full bg-slate-100 text-text-main py-3 rounded-lg text-sm font-bold hover:bg-slate-200 transition-all border border-border-main"
            >
              Manage Candidates
            </button>
          )}
        </div>
      ))}

      {(selectedJob || aiResult) && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-lg rounded-2xl p-8 shadow-2xl border border-border-main max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">{aiResult ? "Application Result" : "Apply for Position"}</h2>
              <button onClick={closeModals} className="text-text-muted hover:text-danger">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {!aiResult ? (
              <>
                <p className="text-text-muted text-sm mb-8">Position: <span className="text-text-main font-bold">{selectedJob?.title}</span></p>
                
                <form onSubmit={handleApply} className="space-y-6">
                  <div className="border-2 border-dashed border-border-main rounded-xl p-10 text-center hover:border-primary transition-colors cursor-pointer relative bg-bg-main">
                    <input 
                      type="file" 
                      accept=".pdf,.docx" 
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      required
                    />
                    <FileText className="w-10 h-10 text-slate-300 mx-auto mb-4" />
                    <p className="text-sm font-bold text-text-main mb-1">
                      {file ? file.name : "Upload your CV"}
                    </p>
                    <p className="text-[11px] text-text-muted uppercase font-bold tracking-wider">PDF or DOCX (Max 5MB)</p>
                  </div>
                  
                  <button 
                    type="submit"
                    disabled={loading || !file}
                    className="w-full bg-primary text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        AI Analyzing CV...
                      </>
                    ) : "Submit Application"}
                  </button>
                </form>
              </>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between p-6 bg-primary-light rounded-2xl border border-primary/10">
                  <div>
                    <p className="text-[11px] font-bold text-primary uppercase tracking-wider mb-1">Match Score</p>
                    <h3 className="text-4xl font-black text-primary">{aiResult.score}%</h3>
                  </div>
                  <div className="w-16 h-16 rounded-full border-4 border-primary/20 flex items-center justify-center">
                    <Award className="w-8 h-8 text-primary" />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-border-main">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">AI Recommendation</h4>
                    <p className="text-sm text-text-main font-medium leading-relaxed">{aiResult.recommendation}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-success/5 rounded-xl border border-success/10">
                      <h4 className="text-[10px] font-bold text-success uppercase tracking-wider mb-2">Matched Skills</h4>
                      <div className="flex flex-wrap gap-1">
                        {aiResult.matched_skills?.map((s: string, i: number) => (
                          <span key={i} className="px-1.5 py-0.5 bg-success/10 text-success text-[9px] font-bold rounded">{s}</span>
                        ))}
                      </div>
                    </div>
                    <div className="p-4 bg-danger/5 rounded-xl border border-danger/10">
                      <h4 className="text-[10px] font-bold text-danger uppercase tracking-wider mb-2">Missing Skills</h4>
                      <div className="flex flex-wrap gap-1">
                        {aiResult.missing_skills?.map((s: string, i: number) => (
                          <span key={i} className="px-1.5 py-0.5 bg-danger/10 text-danger text-[9px] font-bold rounded">{s}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={closeModals}
                  className="w-full bg-text-main text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-all"
                >
                  Close & View Applications
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

function ApplicationsView({
  user,
  applications,
  onRefresh,
  initialSelectedAppId,
  onInitialSelectedAppConsumed,
}: {
  user: User,
  applications: Application[],
  onRefresh: () => void,
  initialSelectedAppId: number | null,
  onInitialSelectedAppConsumed: () => void,
  key?: string
}) {
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [filterJob, setFilterJob] = useState<string>('all');

  useEffect(() => {
    if (!initialSelectedAppId) return;
    const app = applications.find(a => a.id === initialSelectedAppId) || null;
    if (app) {
      setSelectedApp(app);
    }
    onInitialSelectedAppConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedAppId, applications]);

  const handleStatusUpdate = async (id: number, status: string) => {
    try {
      await api.patch(`/applications/${id}/status`, { status }, localStorage.getItem('token')!);
      onRefresh();
      setSelectedApp(null);
    } catch (e) {
      alert('Failed to update status');
    }
  };

  const uniqueJobs = Array.from(new Set(applications.map(app => app.job_title)));
  const filteredApps = filterJob === 'all' 
    ? applications 
    : applications.filter(app => app.job_title === filterJob);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {(user.role === 'admin' || user.role === 'recruiter') && (
        <div className="sleek-panel p-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-muted" />
            <span className="text-sm font-bold text-text-muted uppercase tracking-wider">Filter by Job:</span>
          </div>
          <select 
            className="bg-slate-100 border-none rounded-lg px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
            value={filterJob}
            onChange={(e) => setFilterJob(e.target.value)}
          >
            <option value="all">All Positions</option>
            {uniqueJobs.map(job => (
              <option key={job} value={job}>{job}</option>
            ))}
          </select>
        </div>
      )}

      <div className="sleek-panel">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sleek-table-th">Candidate</th>
                <th className="sleek-table-th">Job Title</th>
                <th className="sleek-table-th">Match Score</th>
                <th className="sleek-table-th">Status</th>
                <th className="sleek-table-th">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-main">
              {filteredApps.map((app) => (
                <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                  <td className="sleek-table-td">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-light text-primary flex items-center justify-center font-bold text-xs">
                        {app.candidate_name[0]}
                      </div>
                      <div>
                        <p className="font-bold text-text-main">{app.candidate_name}</p>
                        <p className="text-[10px] text-text-muted font-medium">{app.candidate_email || 'No email'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="sleek-table-td text-text-muted font-medium">{app.job_title}</td>
                  <td className="sleek-table-td">
                    <div className="flex items-center gap-3">
                      <div className="sleek-progress-bg w-24">
                        <div 
                          className={cn(
                            "sleek-progress-fill",
                            app.score >= 70 ? "bg-success" : app.score >= 40 ? "bg-warning" : "bg-danger"
                          )}
                          style={{ width: `${app.score}%` }}
                        />
                      </div>
                      <span className={cn(
                        "sleek-pill",
                        app.score >= 70 ? "sleek-pill-high" : app.score >= 40 ? "sleek-pill-mid" : "sleek-pill-low"
                      )}>
                        {app.score}%
                      </span>
                    </div>
                  </td>
                  <td className="sleek-table-td">
                    <span className={cn(
                      "sleek-pill",
                      app.status === 'accepted' ? "sleek-pill-high" :
                      app.status === 'rejected' ? "sleek-pill-low" :
                      "bg-slate-100 text-text-muted"
                    )}>
                      {app.status}
                    </span>
                  </td>
                  <td className="sleek-table-td">
                    <button 
                      onClick={() => setSelectedApp(app)}
                      className="text-primary hover:underline text-sm font-bold"
                    >
                      View Analysis
                    </button>
                  </td>
                </tr>
              ))}
              {filteredApps.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-text-muted font-medium">
                    No applications found for this criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedApp && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-border-main flex justify-between items-center bg-white">
              <div>
                <h2 className="text-xl font-bold">{selectedApp.candidate_name}</h2>
                <p className="text-text-muted text-sm">Application for {selectedApp.job_title}</p>
              </div>
              <button onClick={() => setSelectedApp(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <XCircle className="w-6 h-6 text-text-muted" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-bg-main p-6 rounded-xl text-center border border-border-main">
                  <p className="sleek-stat-label">Match Score</p>
                  <p className={cn(
                    "text-4xl font-black",
                    selectedApp.score >= 70 ? "text-success" : selectedApp.score >= 40 ? "text-warning" : "text-danger"
                  )}>{selectedApp.score}%</p>
                </div>
                <div className="bg-bg-main p-6 rounded-xl md:col-span-2 border border-border-main">
                  <p className="sleek-stat-label">AI Recommendation</p>
                  <p className="text-sm font-medium leading-relaxed italic text-text-main">"{selectedApp.analysis.recommendation}"</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h4 className="flex items-center gap-2 font-bold text-text-main mb-4 text-sm">
                    <CheckCircle className="w-4 h-4 text-success" />
                    Matched Skills
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedApp.analysis.matched_skills.map((s, i) => (
                      <span key={i} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded border border-emerald-100">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="flex items-center gap-2 font-bold text-text-main mb-4 text-sm">
                    <XCircle className="w-4 h-4 text-danger" />
                    Missing Skills
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedApp.analysis.missing_skills.map((s, i) => (
                      <span key={i} className="px-2.5 py-1 bg-red-50 text-red-700 text-[11px] font-bold rounded border border-red-100">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-5 rounded-xl border border-border-main">
                  <h4 className="flex items-center gap-2 font-bold text-text-main mb-2 text-sm">
                    <Award className="w-4 h-4 text-primary" />
                    Experience Match
                  </h4>
                  <p className="text-[13px] text-text-muted leading-relaxed">{selectedApp.analysis.experience_match}</p>
                </div>
                <div className="p-5 rounded-xl border border-border-main">
                  <h4 className="flex items-center gap-2 font-bold text-text-main mb-2 text-sm">
                    <GraduationCap className="w-4 h-4 text-primary" />
                    Education Match
                  </h4>
                  <p className="text-[13px] text-text-muted leading-relaxed">{selectedApp.analysis.education_match}</p>
                </div>
              </div>

              <div className="bg-text-main text-white p-6 rounded-xl">
                <h4 className="font-bold mb-3 text-sm">AI Summary</h4>
                <p className="text-[13px] text-slate-300 leading-relaxed">{selectedApp.analysis.summary}</p>
              </div>
            </div>

            {(user.role === 'admin' || user.role === 'recruiter') && (
              <div className="p-6 border-t border-border-main bg-bg-main flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    console.log('[UI] Schedule Interview from application modal', {
                      applicationId: selectedApp.id,
                      candidateEmail: selectedApp.candidate_email,
                    });
                    const email = selectedApp.candidate_email;
                    if (!email) {
                      alert('This candidate has no email on file.');
                      return;
                    }
                    const subject = encodeURIComponent(`Interview invitation — ${selectedApp.job_title}`);
                    const body = encodeURIComponent(
                      `Hi ${selectedApp.candidate_name},\n\nWe’d like to schedule an interview for the ${selectedApp.job_title} role.\n\nPlease reply with your availability for the next few days.\n\nThanks,`
                    );
                    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
                  }}
                  className="flex-1 bg-primary text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <Clock className="w-4 h-4" />
                  Schedule Interview
                </button>
                <button 
                  type="button"
                  onClick={() => handleStatusUpdate(selectedApp.id, 'accepted')}
                  className="flex-1 bg-success text-white py-3 rounded-lg font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <CheckCircle className="w-4 h-4" />
                  Accept Candidate
                </button>
                <button 
                  type="button"
                  onClick={() => handleStatusUpdate(selectedApp.id, 'rejected')}
                  className="flex-1 bg-danger text-white py-3 rounded-lg font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <XCircle className="w-4 h-4" />
                  Reject Candidate
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

function PostJobView({ onBack, onCreated, token }: { onBack: () => void, onCreated: () => void, token: string, key?: string }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    skills: '',
    experience: '',
    education: '',
    location: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/jobs', formData, token);
      onCreated();
      onBack();
    } catch (e) {
      alert('Failed to post job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto sleek-panel p-8"
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold">Create Job Opportunity</h2>
          <p className="text-text-muted text-sm">Fill in the details to post a new position.</p>
        </div>
        <button onClick={onBack} className="text-text-muted hover:text-text-main p-2">
          <XCircle className="w-6 h-6" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider ml-1">Job Title</label>
            <input 
              required
              className="sleek-input"
              placeholder="e.g. Senior Product Designer"
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider ml-1">Location</label>
            <input 
              required
              className="sleek-input"
              placeholder="e.g. London, UK (Hybrid)"
              value={formData.location}
              onChange={e => setFormData({...formData, location: e.target.value})}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider ml-1">Description</label>
          <textarea 
            required
            rows={5}
            className="sleek-input resize-none"
            placeholder="Detailed job description and responsibilities..."
            value={formData.description}
            onChange={e => setFormData({...formData, description: e.target.value})}
          />
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider ml-1">Required Skills (Comma separated)</label>
          <input 
            required
            className="sleek-input"
            placeholder="e.g. Figma, React, TypeScript, UI/UX"
            value={formData.skills}
            onChange={e => setFormData({...formData, skills: e.target.value})}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider ml-1">Experience Range</label>
            <input 
              required
              className="sleek-input"
              placeholder="e.g. 5+ years"
              value={formData.experience}
              onChange={e => setFormData({...formData, experience: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider ml-1">Education</label>
            <input 
              required
              className="sleek-input"
              placeholder="e.g. Bachelor's Degree"
              value={formData.education}
              onChange={e => setFormData({...formData, education: e.target.value})}
            />
          </div>
        </div>

        <div className="flex gap-4 pt-6">
          <button 
            type="button"
            onClick={onBack}
            className="flex-1 px-6 py-3.5 rounded-xl border border-border-main font-bold text-text-muted hover:bg-slate-50 transition-all text-sm"
          >
            Discard Draft
          </button>
          <button 
            type="submit"
            disabled={loading}
            className="flex-1 px-6 py-3.5 rounded-xl bg-primary text-white font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50 text-sm"
          >
            {loading ? "Publishing..." : "Publish Job Offer"}
          </button>
        </div>
      </form>
    </motion.div>
  );
}

function AuthScreen({ onLogin, mode, setMode }: { onLogin: (t: string, u: User) => void, mode: 'login' | 'register', setMode: (m: 'login' | 'register') => void }) {
  const [formData, setFormData] = useState({ email: '', password: '', name: '', role: 'candidate' as Role });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'register') {
        await api.post('/auth/register', formData);
        setMode('login');
        alert('Registration successful! Please login.');
      } else {
        const data = await api.post('/auth/login', { email: formData.email, password: formData.password });
        onLogin(data.token, data.user);
      }
    } catch (e) {
      alert('Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center p-6 font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md p-10 rounded-3xl shadow-2xl border border-border-main"
      >
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-white mx-auto mb-6 shadow-lg shadow-blue-100">
            <Award className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-text-main tracking-tight mb-2">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-text-muted text-sm font-medium">
            {mode === 'login' ? 'Sign in to access your dashboard' : 'Join the most advanced recruitment platform'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === 'register' && (
            <>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider ml-1">Full Name</label>
                <input 
                  required
                  className="sleek-input"
                  placeholder="e.g. Alex Johnson"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider ml-1">I am a...</label>
                <select 
                  className="sleek-input appearance-none"
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value as Role})}
                >
                  <option value="candidate">Candidate (Looking for jobs)</option>
                  <option value="recruiter">Recruiter (Hiring talent)</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </>
          )}
          
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider ml-1">Email Address</label>
            <input 
              required
              type="email"
              className="sleek-input"
              placeholder="name@company.com"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider ml-1">Password</label>
            <input 
              required
              type="password"
              className="sleek-input"
              placeholder="••••••••"
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})}
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50 mt-4 text-sm"
          >
            {loading ? "Processing..." : (mode === 'login' ? 'Sign In' : 'Register Now')}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-border-main text-center">
          <p className="text-text-muted text-sm font-medium">
            {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
            <button 
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="ml-2 text-primary font-bold hover:underline"
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
