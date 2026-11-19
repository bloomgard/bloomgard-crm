
// @ts-nocheck
"use client";
import { AlertTriangle, Check, Menu, LayoutDashboard, Rocket, Inbox, Bell, Magnet, FileText, Settings, Bot, Zap, Sparkles, Pen, Scroll, Database, Users, Wrench, Mail, Palette, X, ClipboardList, Monitor, Search, Star, Trash, Paperclip, Brain, Laptop, File, ChevronRight, BookOpen, ExternalLink, CornerUpLeft } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from "react";
import MasterDataUI from "@/components/MasterDataUI";
import { supabase } from "@/utils/supabaseClient";
import { useMasterDataFields, MasterDataEntry } from "@/hooks/useMasterDataFields";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LineChart, Line, AreaChart, Area, CartesianGrid } from "recharts";
import Handlebars from "handlebars";
import BrandLockup from '@/components/BrandLockup';
import AgentHome from '@/components/AgentHome';
import FieldConfigurator from '@/components/FieldConfigurator';
import LogModule from '@/components/LogModule';
import { STATUS_LOG_TITLE, mirrorStatusIntoMetadata, statusLogEntries, statusLogModule } from '@/lib/statusLog';
import EmailDomainSetup from '@/components/EmailDomainSetup';
import JaaliLoader from '@/components/JaaliLoader';
import SuggestInput from '@/components/SuggestInput';
import TasksView from '@/components/platform/TasksView';
import TeamView from '@/components/platform/TeamView';
import NotificationBell from '@/components/platform/NotificationBell';
import { FiltersPopover, ColumnsPopover, FilterChips } from '@/components/platform/QuotesToolbar';
import FindInQuote from '@/components/platform/FindInQuote';
import QuoteNotes from '@/components/platform/QuoteNotes';
import PluginsView from '@/components/platform/PluginsView';
import StudioView from '@/components/platform/StudioView';
import LeadsView from '@/components/platform/LeadsView';
import InboxLeadPanel from '@/components/platform/InboxLeadPanel';
import { api as platformApi, emitClientEvent } from '@/lib/platform/client';
import { installAuthFetch } from '@/lib/authFetch';

// every /api call from the workspace carries the user's session (see lib/authFetch.ts)
installAuthFetch();
import { CheckSquare, UsersRound, Wand2, Workflow, Plug, ArrowDownUp, Download, Upload } from 'lucide-react';
import { QUOTE_TEMPLATES } from '@/lib/quoteTemplates';
import { CURRENCIES, currencyCode, money } from '@/lib/currency';

// BULLETPROOF FORMATTER
const formatValue = (val, isMoney = false) => {
  if (val == null || val === "") return val;
  // Money reads the way it is written on an Indian invoice: 2,49,600 — and ₹1,69,000 on Home
  // and ₹169000.00 in the quote list were the same number twice.
  if (isMoney && !isNaN(parseFloat(val))) {
    const n = parseFloat(val);
    return n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
  }
  let strVal = String(val);
  if (/\.\d{3,}/.test(strVal)) {
    if (!isNaN(parseFloat(strVal))) return parseFloat(strVal).toFixed(2);
    return strVal.replace(/(\d+\.\d{2})\d{3,}/g, '$1');
  }
  return val;
};

const normalize = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Fields that name the client: choosing a known one fills the rest from their last quote. */
const CLIENT_KEYS = new Set(['clientname', 'companyname', 'client', 'customername', 'buyername']);
/** Never carried over from a previous quote: they belong to this quote alone. */
const PREFILL_SKIP_TYPES = new Set(['master_status', 'logged_in', 'calculated', 'file', 'attachment']);
const PREFILL_SKIP_NAMES = /subtotal|total|amount|qn|quote.?(no|number|id)|ref.?id|^date$|valid/i;

/** A stable id so each quote-form label points at its own control (screen readers, autofill, tests). */
const fieldDomId = (section: string, field: string, rowIdx: number | null = null) =>
  `qf-${normalize(section)}-${normalize(field)}${rowIdx === null ? '' : `-${rowIdx}`}`;

// A real v4 UUID (the database columns are uuid): crypto.randomUUID where available,
// otherwise a Math.random-based v4 so saving never throws on older WebViews.
const safeUUID = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
const ALIASES = {
  client_name: ['company_name', 'client', 'customer_name'],
  contact_person: ['contact', 'person'],
  email_id: ['email', 'client_email', 'email_address'],
  phone_number: ['phone', 'client_phone', 'contact_number', 'mobile'],
  billing_address: ['address', 'client_address', 'shipping_address'],
  subtotal: ['total_value', 'ta', 'total_amount', 'total'],
  freight: ['delivery_terms', 'freight_terms'],
  source_ref: ['reference', 'source', 'lead_source'],
  item_name: ['name', 'product_name', 'product', 'description'],
  item_code: ['code', 'hsn'],
  quantity: ['qty'],
  item_rate: ['rate', 'price'],
  item_br: ['total', 'basic_rate', 'amount', 'line_total'],
  file_name: ['filename', 'name', 'title'],
  file_path: ['filepath', 'url', 'link', 'attachment']
};

const JAALI_UI = true;
const DOCS_URL = 'https://docs.bloomgard.co/crm/';
const HELP: Record<string, { text: string; href: string }> = {
  home: { text: 'Talk to Bloomgard AI: ask questions, search quotes, send email, edit the catalogue, change settings or build charts. Changes wait for your confirmation.', href: 'getting-started/' },
  pipeline: { text: 'All quotations with their status. Search, change status, import or export, and open a quote to preview the PDF or email it to the client.', href: 'sales/quotes/' },
  new_entry: { text: 'Fill the form top to bottom. Choosing a catalogue value (such as an item code) fills the linked fields automatically. The quote number is assigned when you save.', href: 'sales/quotes/#creating-a-quote' },
  inbox: { text: 'Client emails land here. Bloomgard AI reads each one: an enquiry shows who wrote, what they want, what is in your catalogue and a drafted reply. Nothing is sent until you send it.', href: 'email/inbox/' },
  alerts: { text: 'Quotes that have gone quiet, scored Hot, Warm or Cold. Review the AI suggested follow-up, edit it if needed, then approve to send.', href: 'sales/follow-ups/' },
  agents: { text: 'Follow-up agents chase quotes for you on a schedule. Set their instructions, importance and frequency, then assign quotes to them.', href: 'sales/follow-ups/#follow-up-agents' },
  leadgen: { text: 'Enquiries read from the inbox, scored hot, warm or cold with the reasons. Send the drafted reply, or Create quote to turn one into a quotation in a step.', href: 'sales/lead-gen/' },
  docs: { text: 'Every generated quote PDF. View or download a document again, or delete it.', href: 'sales/quotes/#pdf-export-and-the-document-library' },
  copilot: { text: 'Ask questions about your pipeline, inbox, follow-ups and catalogue in plain language. Answers use only your workspace data.', href: 'ai/dashboard-and-copilot/#bloomgard-ai-chat-assistant' },
  settings: { text: 'Pick a screen to configure your profile, catalogue, team, quote form, email, look and feel, AI behaviour and quote template.', href: 'configuration/settings/' },
  'settings:profile': { text: 'Your name, job title and phone. The AI signs emails with these, so there are no placeholder names in drafts.', href: 'configuration/settings/#your-profile' },
  'settings:master-data': { text: 'Your product catalogue. Type or import from Excel, and link columns parent to child (code, name, unit, rate) so one choice fills the rest.', href: 'sales/master-data/' },
  'settings:users': { text: 'Add teammates as Agent, Manager or Admin, change roles and reset passwords. Agents only see their own quotes.', href: 'configuration/settings/#user-access' },
  'settings:blueprint': { text: 'Design the quote form: sections and fields (text, number, dropdown, paragraph, attachment, formula). Save the blueprint to apply it.', href: 'configuration/settings/#field-configurator' },
  'settings:email': { text: 'Set your personal address and your forwarding address, then forward client mail from Gmail or Outlook so it reaches the Inbox.', href: 'email/email-setup/' },
  'settings:personalization': { text: 'Switch between the light (Kora) and dark (Raat) themes.', href: 'configuration/settings/#personalization' },
  'settings:ai-personality': { text: 'Set tone, English level, how eager the replies sound, and your own instructions. Add routing rules to forward certain mail to a teammate.', href: 'ai/ai-assistant/#ai-settings-managersadmins' },
  'settings:quote-template': { text: 'Set your company name and logo and edit the HTML used for quote PDFs. Use {{field_name}} to insert quote values and {{company_logo}} for your logo.', href: 'configuration/settings/#quote-template' },
  'settings:automations': { text: 'Rules that run by themselves: when something happens to a quote, check conditions, then act. Anything a client would see waits on the OK list for a person.', href: 'platform/automations/' },
  'settings:plugins': { text: 'Connect Bloomgard to other tools: a signed webhook, Slack, an inbound API for your website form, and an accounting export.', href: 'platform/plugins/' },
  tasks: { text: 'Approvals the AI and your automations prepared, and to-dos the team assigned. Approve runs the change exactly as shown; nothing reaches a client without it.', href: 'platform/ok-list/' },
  team: { text: 'Each person\'s quotes, pipeline value, wins, open tasks and quiet quotes, and a feed of what moved. Managers and admins only.', href: 'platform/team/' },
  studio: { text: 'Ask Bloomgard AI to build automations, views, skills, form changes and data fixes. Drafts change nothing until applied, and applied changes can be rolled back.', href: 'platform/studio/' },
};

function DocsLink({ view, sub }: { view: string; sub?: string }) {
  const key = view === 'settings' && sub && sub !== 'menu' ? `settings:${sub}` : view;
  const h = HELP[key];
  if (!h) return null;
  return (
    <a
      data-testid="help-hint"
      href={DOCS_URL + h.href}
      target="_blank"
      rel="noopener noreferrer"
      title={h.text}
      className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-indigo-600 transition-colors"
    >
      Docs <ExternalLink className="w-3 h-3" />
    </a>
  );
}

export default function ClientDashboard() {
  const fileInputRef = useRef(null);
  const quotePanelRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef(null);
  const iframeRef = useRef(null);

  const [authState, setAuthState] = useState('checking');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [tenantId, setTenantId] = useState(null);
  const [companyName, setCompanyName] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [blueprint, setBlueprint] = useState([]);
  const [agents, setAgents] = useState([]);
  const [editingAgent, setEditingAgent] = useState(null);
  const [isSavingAgent, setIsSavingAgent] = useState(false);
  const [isRunningCoordinator, setIsRunningCoordinator] = useState(false);
  const [records, setRecords] = useState([]);
  const [currentView, setCurrentView] = useState("home"); // the AI command centre is the landing view
  useEffect(() => {
    const names: Record<string, string> = { home: 'Home', pipeline: 'Quotes', inbox: 'Inbox', alerts: 'Follow ups', leadgen: 'Lead Gen', docs: 'Documents', settings: 'Settings', new_entry: 'New quote', agents: 'Agents', tasks: 'OK list', team: 'Team', studio: 'Studio' };
    document.title = `${names[currentView] || 'Workspace'} · Bloomgard CMA`;
  }, [currentView]);
  const [settingsSubView, setSettingsSubView] = useState<'menu' | 'master-data' | 'users' | 'blueprint' | 'email' | 'data' | string>('menu');
  const { masterTree, findAllEntriesByKey, findEntryById } = useMasterDataFields(tenantId || undefined, 'manual');
  const { masterTree: autoMasterTree, findAllEntriesByKey: findAllAutoEntriesByKey } = useMasterDataFields(tenantId || undefined, 'auto');

  // ── Master Data cascade ────────────────────────────────────────────────
  // The same text (e.g. "PCS") can exist under many parents, so a selected value is
  // identified by walking the chain from the root, never by text alone.
  const resolveSelectedValueIds = (entry, getVal) => {
    const text = getVal(entry.key_name);
    if (!text) return [];
    let candidates = (entry.values || []).filter(v => v.value_text === text);
    if (entry.parent_id) {
      const parent = findEntryById(entry.parent_id);
      const parentIds = parent ? resolveSelectedValueIds(parent, getVal) : [];
      if (parentIds.length) candidates = candidates.filter(v => !v.parent_value_id || parentIds.includes(v.parent_value_id));
    }
    return candidates.map(v => v.id);
  };
  // Options a field may offer: every value of a root key, or only the values linked to the
  // parent's currently selected value (values with no link stay unconditional).
  const cascadeValues = (entry, getVal) => {
    const vals = entry.values || [];
    if (!entry.parent_id) return vals;
    const parent = findEntryById(entry.parent_id);
    const parentIds = parent ? resolveSelectedValueIds(parent, getVal) : [];
    return vals.filter(v => !v.parent_value_id || parentIds.includes(v.parent_value_id));
  };
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [customSender, setCustomSender] = useState("");
  const [userRoutingSlug, setUserRoutingSlug] = useState("");
  const [workspaceInbound, setWorkspaceInbound] = useState("");   // the shared address, for context in Email Settings
  const [personalRoutingOpen, setPersonalRoutingOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<{ tone: string, englishLevel: string, desperation: string, instructions?: string, emailRouting?: { lookFor: string, routeTo: string, sendRouteMessage: boolean, routeMessage: string }[] }>({ tone: 'Professional', englishLevel: 'Native', desperation: 'Low', instructions: '', emailRouting: [] });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '', job_title: '', phone: '', signature: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [dispatchingId, setDispatchingId] = useState(null); // Track AI Agent dispatch
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [emailSenderPref, setEmailSenderPref] = useState<'personal' | 'common'>('personal');

  const [emailDraft, setEmailDraft] = useState({ to: "", subject: "", message: "", attachmentBase64: "", filename: "" });
  const [chatHistory, setChatHistory] = useState([]);
  const [currentInput, setCurrentInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [dashCommand, setDashCommand] = useState("");
  const [isBuildingDash, setIsBuildingDash] = useState(false);
  const [dynamicInsights, setDynamicInsights] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [qn, setQn] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dynamicData, setDynamicData] = useState({});
  const [statusFilter, setStatusFilter] = useState("");
  const [editedSnippets, setEditedSnippets] = useState({});
  const [userPreferences, setUserPreferences] = useState({ theme: 'light' });
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [agentQuoteSearch, setAgentQuoteSearch] = useState("");
  const [selectedAgentView, setSelectedAgentView] = useState(null);
  const [agentViewTab, setAgentViewTab] = useState('follow_up');
  const [emailThreads, setEmailThreads] = useState<any[]>([]);
  const [triageTab, setTriageTab] = useState('due');
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [htmlTemplate, setHtmlTemplate] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [tenantUsers, setTenantUsers] = useState([]);
  const [inboxLogs, setInboxLogs] = useState([]);
  const [selectedInboxEmail, setSelectedInboxEmail] = useState(null);
  const [isAnalyzingEmail, setIsAnalyzingEmail] = useState(false);
  const [emailAiAnalysis, setEmailAiAnalysis] = useState({});

  const [inboxSearch, setInboxSearch] = useState('');
  const [inboxReplyText, setInboxReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  const [quoteReplyTexts, setQuoteReplyTexts] = useState({});
  const [isSendingQuoteReply, setIsSendingQuoteReply] = useState<string | false>(false);
  const [triageDaysFilter, setTriageDaysFilter] = useState(3);
  const [triageSearch, setTriageSearch] = useState('');

  // User Onboarding State
  const [onboardEmail, setOnboardEmail] = useState("");
  const [onboardPassword, setOnboardPassword] = useState("");
  const [onboardRole, setOnboardRole] = useState("agent");
  const [passwordCache, setPasswordCache] = useState<Record<string, string>>({});

  // Blueprint Configurator State
  const [draggedSectionIdx, setDraggedSectionIdx] = useState<number | null>(null);
  const [draggedFieldInfo, setDraggedFieldInfo] = useState<{ sIdx: number, fIdx: number } | null>(null);

  const [onboardName, setOnboardName] = useState("");
  const [userSecret, setUserSecret] = useState<null | { email: string; password: string; kind: 'new' | 'reset' }>(null);
  // the editor's contents before a starter template was loaded, so it can be put back
  const [templateBefore, setTemplateBefore] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<null | { name: string; html: string }>(null);
  const reloadUsers = async () => {
    const { data: users } = await supabase.from("profiles").select("*").eq("tenant_id", tenantId);
    setTenantUsers(users || []);
  };
  const handleCreateUser = async () => {
    if (!onboardEmail) return alert("Enter the person's email.");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token || ''}` },
        // no password typed: the server generates a strong one and returns it once
        body: JSON.stringify({ email: onboardEmail, password: onboardPassword || undefined, role: onboardRole, fullName: onboardName || undefined })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to create user");
      setUserSecret({ email: onboardEmail.trim().toLowerCase(), password: data.password, kind: 'new' });
      setOnboardEmail(""); setOnboardPassword(""); setOnboardName(""); setOnboardRole("agent");
      reloadUsers();
    } catch (err: any) { alert(err.message); }
  };

  const [blueprintSaved, setBlueprintSaved] = useState("");
  const [blueprintSaving, setBlueprintSaving] = useState(false);
  const handleSaveBlueprint = async () => {
    setBlueprintSaving(true);
    try {
      const tid = user?.tenant_id || tenantId;
      // schema_config also holds the AI settings, follow-up agents and branding: keep them, only replace the modules
      const { data: current } = await supabase.from("tenant_schemas").select("schema_config").eq("tenant_id", tid).maybeSingle();
      const special = (Array.isArray(current?.schema_config) ? current.schema_config : []).filter((x: any) => x && (x.is_agent_config || x.is_ai_settings || x.is_branding));
      const modules = blueprint.map((m: any) => (m.is_log ? { ...m, allow_multiple: false } : m));
      const { error } = await supabase.from("tenant_schemas").update({ schema_config: [...modules, ...special] }).eq("tenant_id", tid);
      if (error) throw error;
      setBlueprintSaved(JSON.stringify(blueprint));
    } catch (e: any) {
      alert("Failed to update schema: " + e.message);
    } finally {
      setBlueprintSaving(false);
    }
  };

  /** Master Status fields on ordinary modules mirror the quote's status, so keep them in step. */
  const statusIntoMetadata = (rec: any, newStatus: string) =>
    mirrorStatusIntoMetadata(rec?.custom_metadata, blueprint, newStatus);

  /**
   * An entry in the built-in Status Log. Unlike the configurable log modules it is kept in `status_logs`,
   * because moving the quote's status is what creates it; the note is the user's own, nothing generated.
   */
  const addStatusLogEntry = async (rec: any, values: Record<string, any>) => {
    const status = String(values.status || '').trim();
    const note = String(values.note || '').trim();
    if (!status) throw new Error('Choose a status.');
    const { data: fresh, error: readErr } = await supabase.from('quotations').select('status, custom_metadata').eq('id', rec.id).single();
    if (readErr) throw readErr;
    const old = fresh?.status || null;
    const { data: row, error } = await supabase.from('status_logs')
      .insert([{ quotation_id: rec.id, old_status: old, new_status: status, changed_by: user?.email || null, comments: note || null }])
      .select().single();
    if (error) throw error;
    let meta: any = null;
    if (status !== old) {
      meta = statusIntoMetadata({ custom_metadata: fresh?.custom_metadata }, status);
      const { error: upErr } = await supabase.from('quotations')
        .update({ status, custom_metadata: meta, last_contact_date: new Date().toISOString() }).eq('id', rec.id);
      if (upErr) throw upErr;
    }
    setSelectedRecord((p: any) => (p && p.id === rec.id
      ? { ...p, ...(meta ? { status, custom_metadata: meta } : {}), status_logs: [...(p.status_logs || []), row] }
      : p));
    if (tenantId) fetchRecords(tenantId);
    if (status !== old) emitClientEvent('quote.status_changed', rec.id, { from: old, to: status });
  };

  /** Append an entry to a log module on a quote. A Master Status field in the entry also moves the quote's status. */
  const addLogEntry = async (rec: any, section: any, values: Record<string, any>) => {
    const entry = { ...values, _at: new Date().toISOString(), _by: user?.email || "" };
    const { data: fresh, error: readErr } = await supabase.from("quotations").select("custom_metadata, status").eq("id", rec.id).single();
    if (readErr) throw readErr;
    const statusField = (section.fields || []).find((f: any) => f.type === "master_status" && values[f.name]);
    const newStatus = statusField ? String(values[statusField.name]) : null;
    const moves = !!newStatus && newStatus !== fresh?.status;
    // an entry that moves the status moves every Master Status field in the form with it
    const meta = moves ? statusIntoMetadata({ custom_metadata: fresh?.custom_metadata }, newStatus) : { ...(fresh?.custom_metadata || {}) };
    meta[section.title] = [...(Array.isArray(meta[section.title]) ? meta[section.title] : []), entry];
    const patch: any = { custom_metadata: meta, last_contact_date: new Date().toISOString() };
    if (moves) patch.status = newStatus;
    const { error } = await supabase.from("quotations").update(patch).eq("id", rec.id);
    if (error) throw error;
    if (patch.status) {
      await supabase.from("status_logs").insert([{ quotation_id: rec.id, old_status: fresh?.status || null, new_status: newStatus, changed_by: user?.email || null, comments: `Logged in ${section.title}` }]);
    }
    setSelectedRecord((prev: any) => (prev && prev.id === rec.id ? { ...prev, custom_metadata: meta, ...(patch.status ? { status: patch.status } : {}) } : prev));
    if (tenantId) fetchRecords(tenantId);
    emitClientEvent('log.added', rec.id, { module: section.title, entry: values });
    if (patch.status) emitClientEvent('quote.status_changed', rec.id, { from: fresh?.status || null, to: patch.status });
  };

  const handleQuoteReply = async (quote: any) => {
    const text = quoteReplyTexts[quote.id as keyof typeof quoteReplyTexts] as string;
    if (!text || !text.trim()) return;
    setIsSendingQuoteReply(quote.id);
    let targetEmail = quote.client_email || quote.clients?.email || quote.custom_metadata?.client_email || quote.custom_metadata?.['Client Information']?.email;

    if (!targetEmail) {
      // Fallback: Check if we have received any inbound emails for this quote
      const { data: inboundEmails } = await supabase
        .from('inbound_emails')
        .select('sender_email')
        .ilike('subject', `%${quote.qn_number}%`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (inboundEmails && inboundEmails.length > 0) {
        targetEmail = inboundEmails[0].sender_email;
      }
    }

    if (!targetEmail) {
      alert("No client email address found for this quote. Please add an email to the client profile first.");
      setIsSendingQuoteReply(false);
      return;
    }

    try {
      const res = await fetch(getApiUrl('/api/inbox/reply'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: user?.tenant_id || tenantId,
          emailId: null,
          to: targetEmail,
          subject: `Re: Following up on Quote ${quote.qn_number}`,
          htmlBody: text.replace(/\n/g, '<br/>'),
          parsedTenantId: user?.tenant_id || tenantId
        })
      });
      if (res.ok) {
        setQuoteReplyTexts(prev => ({ ...prev, [quote.id]: '' }));
        alert("Reply sent successfully!");

        // Update local selected record state so the UI instantly reflects the new message without requiring a full reload
        if (selectedRecord && selectedRecord.id === quote.id) {
          const newMsg = { role: 'agent', content: text, timestamp: new Date().toISOString() };
          const updatedMeta = { ...(selectedRecord.custom_metadata || {}) };
          const conversations = [...(updatedMeta.agent_conversations || [])];
          conversations.push(newMsg);
          updatedMeta.agent_conversations = conversations;
          setSelectedRecord({ ...selectedRecord, custom_metadata: updatedMeta });
        }
        fetchRecords(user?.tenant_id || tenantId);
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`Failed to send reply: ${errorData.error || res.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error sending reply");
    } finally {
      setIsSendingQuoteReply(false);
    }
  };

  const handleInboxAction = async (emailId, action, value) => {
    // Optimistic: the list reacts immediately; if the server refuses, put the old value back.
    const before = inboxLogs.find(e => e.id === emailId)?.[action];
    const apply = (v) => {
      setInboxLogs(prev => prev.map(e => e.id === emailId ? { ...e, [action]: v } : e));
      setSelectedInboxEmail(prev => (prev && prev.id === emailId ? { ...prev, [action]: v } : prev));
    };
    apply(value);
    try {
      const res = await fetch(getApiUrl('/api/inbox/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId, updates: { [action]: value }, tenantId: user?.tenant_id || tenantId })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.error("Inbox Action Error:", e);
      apply(before);
    }
  };

  const handleInboxReply = async () => {
    if (!selectedInboxEmail || !inboxReplyText.trim()) return;
    setIsSendingReply(true);
    try {
      const res = await fetch(getApiUrl('/api/inbox/reply'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: user?.tenant_id || tenantId,
          emailId: selectedInboxEmail.id,
          to: selectedInboxEmail.sender_email,
          subject: selectedInboxEmail.subject.startsWith('Re:') ? selectedInboxEmail.subject : `Re: ${selectedInboxEmail.subject}`,
          htmlBody: inboxReplyText.replace(/\n/g, '<br/>'),
          parsedTenantId: user?.tenant_id || tenantId
        })
      });
      if (res.ok) {
        setInboxReplyText('');
        alert("Reply sent successfully!");
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`Failed to send reply: ${errorData.error || res.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error sending reply");
    } finally {
      setIsSendingReply(false);
    }
  };

  const getApiUrl = (endpoint) => endpoint;

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isThinking]);

  useEffect(() => {
    if (user) {
      setProfileForm({
        full_name: user.full_name || '',
        job_title: user.job_title || '',
        phone: user.phone || '',
        signature: user.signature || '',
      });
    }
  }, [user?.id]);

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setIsSavingProfile(true);
    try {
      const { error } = await supabase.from('profiles').update(profileForm).eq('id', user.id);
      if (error) throw error;
      setUser({ ...user, ...profileForm });
      alert("Profile updated successfully!");
    } catch (e: any) {
      alert("Failed to save: " + e.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    async function initSystem() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { setAuthState('unauthed'); setLoading(false); window.location.replace("/"); return; }

        const { data: profile, error: profileErr } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        if (profileErr || !profile) { setAuthState('unauthed'); setLoading(false); window.location.replace("/"); return; }

        const fullUser = { ...profile, email: session.user.email };
        setUser(fullUser);
        if (fullUser.inbound_email) setUserRoutingSlug(fullUser.inbound_email.split('@')[0]);
        setAuthState('authed');

        let prefs = { theme: 'light' };
        if (profile.custom_metadata?.preferences) {
          prefs = profile.custom_metadata.preferences;
        } else {
          const localPrefs = localStorage.getItem('userPrefs_' + profile.id);
          if (localPrefs) {
            try { prefs = JSON.parse(localPrefs); } catch (e) { }
          }
        }
        setUserPreferences(prefs);

        if (profile.tenant_id) {
          setTenantId(profile.tenant_id);

          const { data: tenantData } = await supabase.from("tenants").select("company_name, ai_enabled, custom_email_sender, routing_slug, inbound_routing_id").eq("id", profile.tenant_id).maybeSingle();
          if (tenantData) {
            if (tenantData.company_name) setCompanyName(tenantData.company_name);
            if (tenantData.ai_enabled === false) setAiEnabled(false);
            if (tenantData.custom_email_sender) setCustomSender(tenantData.custom_email_sender);
            const routing = tenantData.inbound_routing_id || tenantData.routing_slug;
            if (routing) setWorkspaceInbound(`${routing}@inbound.bloomgard.co`);
          }

          const { data: schema } = await supabase.from("tenant_schemas").select("schema_config, html_template").eq("tenant_id", profile.tenant_id).maybeSingle();
          if (schema) {
            setHtmlTemplate(schema.html_template || "");
          }
          if (schema?.schema_config) {
            const agentConfig = schema.schema_config.find(s => s.is_agent_config);
            if (agentConfig) setAgents(agentConfig.agents || []);
            const aiSettingsConfig = schema.schema_config.find(s => s.is_ai_settings);
            if (aiSettingsConfig) setAiSettings({ tone: aiSettingsConfig.tone || 'Professional', englishLevel: aiSettingsConfig.englishLevel || 'Native', desperation: aiSettingsConfig.desperation || 'Low', instructions: aiSettingsConfig.instructions || '', emailRouting: aiSettingsConfig.emailRouting || [] });
            const brandingConfig = schema.schema_config.find(s => s.is_branding);
            if (brandingConfig) setLogoUrl(brandingConfig.logo_url || "");

            const actualBlueprint = schema.schema_config.filter(s => !s.is_agent_config && !s.is_ai_settings && !s.is_branding);
            setBlueprint(actualBlueprint);
            setBlueprintSaved(JSON.stringify(actualBlueprint));
            const init = {};
            actualBlueprint.forEach(s => { init[s.title] = s.is_log ? [] : s.allow_multiple ? [{}] : {}; });
            setDynamicData(init);
          }

          if (fullUser.role === 'admin' || fullUser.role === 'manager') {
            const { data: users } = await supabase.from("profiles").select("*").eq("tenant_id", profile.tenant_id);
            if (users) setTenantUsers(users);
          }

          await fetchRecords(profile.tenant_id);
        }
      } catch (err) {
        console.error("Boot Error:", err);
        setAuthState('authed');
      } finally {
        setLoading(false);
      }
    }
    initSystem();
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("ai_insights").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setDynamicInsights(data); });
  }, [tenantId]);

  // /dashboard?view=tasks opens that screen (app shortcuts, links in notification emails)
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('view');
    if (v && ['home', 'pipeline', 'inbox', 'alerts', 'tasks', 'leadgen', 'docs', 'team', 'studio', 'settings', 'new_entry'].includes(v)) setCurrentView(v);
  }, []);

  // a prefill note belongs to the form it was made in
  useEffect(() => { setPrefillNote(null); }, [currentView, editingId]);

  // Escape closes the topmost overlay, innermost first — the usual way out of a panel or dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showEmailModal) setShowEmailModal(false);
      else if (viewingDoc) setViewingDoc(null);
      else if (selectedRecord) setSelectedRecord(null);
      else if (isMobileMenuOpen) setIsMobileMenuOpen(false);
      else return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showEmailModal, viewingDoc, selectedRecord, isMobileMenuOpen]);

  useEffect(() => {
    if (!blueprint.length) return;
    setDynamicData(prev => {
      let updated = false;
      const newData = JSON.parse(JSON.stringify(prev));
      blueprint.forEach(section => {
        if (section.is_log) return; // log entries are stamped when they are added
        section.fields.forEach(field => {
          if (field.type === 'logged_in') {
            if (section.allow_multiple && newData[section.title]) {
              newData[section.title].forEach((row, rIdx) => {
                if (row[field.name] !== user?.email) { newData[section.title][rIdx][field.name] = user?.email; updated = true; }
              });
            } else if (newData[section.title]) {
              if (newData[section.title][field.name] !== user?.email) { newData[section.title][field.name] = user?.email; updated = true; }
            }
          }
          if (field.type === 'calculated' && field.options) {
            const cleanNumber = (val) => {
              if (val == null || val === '') return 0;
              const cleaned = String(val).replace(/[^0-9.-]/g, '');
              const num = Number(cleaned);
              return isNaN(num) ? 0 : num;
            };
            const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const processCross = (f) => {
              const ms = f.match(/SUM\[(.*?)\.(.*?)\]/g);
              if (ms) ms.forEach(m => {
                const p = m.match(/SUM\[(.*?)\.(.*?)\]/);
                if (p) {
                  const s = (newData[p[1]] || []).reduce((a, r) => a + cleanNumber(r[p[2]]), 0);
                  f = f.replace(m, String(s.toFixed(2)));
                }
              });
              return f;
            };
            if (section.allow_multiple && newData[section.title]) {
              newData[section.title].forEach((row, rIdx) => {
                let f = processCross(field.options);
                section.fields.forEach(sf => { f = f.replace(new RegExp(`{{${escapeRegExp(sf.name)}}}`, 'g'), cleanNumber(row[sf.name])); });
                try {
                  let r = new Function('return ' + f)();
                  if (typeof r === 'number' && !isNaN(r)) {
                    r = parseFloat(r.toFixed(2));
                    if (row[field.name] !== r) { newData[section.title][rIdx][field.name] = r; updated = true; }
                  } else {
                    console.log(`[Calc] Failed to evaluate ${field.name} on ${section.title} row ${rIdx}. Formula: ${f}, Result: ${r}`);
                  }
                } catch (e) {
                  console.log(`[Calc] Error evaluating ${field.name}: ${f} -> ${e.message}`);
                }
              });
            } else if (newData[section.title]) {
              let f = processCross(field.options);
              section.fields.forEach(sf => { f = f.replace(new RegExp(`{{${escapeRegExp(sf.name)}}}`, 'g'), cleanNumber(newData[section.title][sf.name])); });
              try {
                let r = new Function('return ' + f)();
                if (typeof r === 'number' && !isNaN(r)) {
                  r = parseFloat(r.toFixed(2));
                  if (newData[section.title][field.name] !== r) { newData[section.title][field.name] = r; updated = true; }
                } else {
                  console.log(`[Calc] Failed to evaluate ${field.name} on ${section.title}. Formula: ${f}, Result: ${r}`);
                }
              } catch (e) {
                console.log(`[Calc] Error evaluating ${field.name}: ${f} -> ${e.message}`);
              }
            }
          }
        });
      });
      return updated ? newData : prev;
    });
  }, [dynamicData, blueprint, user]);

  async function fetchRecords(tId) {
    try {
      const { data, error } = await supabase
        .from("quotations")
        .select(`*, clients (*), quotation_items (*), quotation_attachments (*), status_logs (*)`)
        .eq("tenant_id", tId)
        .order("qn_number", { ascending: false });

      if (!error && data) {
        const parsed = data.map(r => {
          let m = r.custom_metadata;
          if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { m = {}; } }
          return { ...r, custom_metadata: m };
        });
        setRecords(parsed);
      }

      const { data: threadsData, error: threadsError } = await supabase
        .from("email_threads")
        .select("*, quotations(*, clients(*))")
        .eq("tenant_id", tId)
        .order("last_updated", { ascending: false });
        
      if (!threadsError && threadsData) {
        setEmailThreads(threadsData);
      }
    } catch (err) {
      console.error("Fetch Error:", err);
    }
  }
  async function fetchInboxLogs() {
    try {
      let url = '/api/inbox';
      if (tenantId) url += `?tenantId=${tenantId}`;
      const res = await fetch(getApiUrl(url));
      if (!res.ok) throw new Error("API Auth Error");
      const { data } = await res.json();
      if (data) setInboxLogs(data);
    } catch (err) { console.error("Inbox Fetch Error:", err); }
  }

  // which emails Bloomgard AI has read as enquiries (for the chips and the Enquiries filter)
  useEffect(() => {
    if (currentView !== 'inbox' || !inboxLogs.length) return;
    const ids = inboxLogs.filter((e: any) => !e.is_deleted).map((e: any) => e.id).slice(0, 100);
    platformApi(`/api/leads?status=all&email_ids=${ids.join(',')}`)
      .then((r) => setEmailLeads(Object.fromEntries((r.leads || []).map((l: any) => [l.email_id, { id: l.id, kind: l.kind, status: l.status, temperature: l.temperature, score: l.score }]))))
      .catch(() => {});
  }, [inboxLogs, currentView]);

  useEffect(() => {
    if (currentView === 'inbox' || currentView === 'copilot') fetchInboxLogs();
  }, [currentView]);

  const isManager = user?.role?.toLowerCase() === 'manager' || user?.role?.toLowerCase() === 'admin';
  const visibleRecords = (isManager ? records : records.filter(r => r.created_by_email === user?.email)).filter(r => currentView === 'leadgen' ? r.status === 'Lead' : r.status !== 'Lead');
  const docsRecords = visibleRecords.filter(r => r.status === 'Approved' || r.custom_metadata?.has_pdf_generated === true);
  const visibleEmailThreads = isManager ? emailThreads : emailThreads.filter(t => t.quotations?.created_by_email === user?.email || t.agent_id === user?.id);

  // DERIVED STATE: AI Alerts Triage
  const pendingAlerts = visibleRecords.filter(r => {
    // Flag quotes that haven't been dispatched yet
    if (r.follow_up_status === 'Agent Dispatched' || r.custom_metadata?.follow_up_status === 'Agent Dispatched') return false;

    // Don't flag quotes that are already Approved or Lost
    if (r.status === 'Approved' || r.status === 'Lost') return false;

    const parseSafeDate = (dString: any) => {
      if (!dString) return new Date();
      if (typeof dString === 'number') return new Date(dString);
      const str = String(dString);
      if (str.match(/^\d{2}[\/\-]\d{2}[\/\-]\d{4}/)) {
        const parts = str.split(/[\/\-]/);
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00Z`);
      }
      const parsed = new Date(str);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
    };

    if (triageDaysFilter === 0) return true;

    const dueDate = r.follow_up_due_date || r.custom_metadata?.follow_up_due_date;
    if (!dueDate) {
      // Prioritize the manual 'date' field over the unchangeable 'created_at' so manual database edits actually take effect
      const createdDate = parseSafeDate(r.date || r.created_at || Date.now());
      const daysOld = (new Date().getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
      // Add a small buffer for clock skew if testing immediate quotes, though triageDaysFilter === 0 handles most cases
      return daysOld >= (triageDaysFilter - 0.05);
    }

    // Check if the due date is today or in the past
    return parseSafeDate(dueDate) <= new Date();
  });

  const historyAlerts = visibleRecords.filter(r => {
    return r.follow_up_status != null || r.custom_metadata?.follow_up_status != null;
  });

  // Lead temperature: how long since the last touch on this quote, with an
  // "incoming client reply waiting" override that always makes it hot.
  const quoteTemperature = (r: any): 'hot' | 'warm' | 'cold' => {
    const hasIncoming = (emailThreads || []).some(
      (t: any) => t.quote_id === r.id && t.triage_status === 'incoming'
    );
    if (hasIncoming) return 'hot';
    const last = r.last_contact_date || r.date || r.created_at;
    const days = last ? (Date.now() - new Date(last).getTime()) / 86400000 : 999;
    if (days <= 3) return 'hot';
    if (days <= 10) return 'warm';
    return 'cold';
  };
  /** "today", "3 days ago" — plain words for how long a quote has been quiet. */
  const daysSinceContact = (r: any) => {
    const last = r.last_contact_date || r.date || r.created_at;
    if (!last) return 'never';
    const d = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  };

  const TEMP_META: Record<string, { label: string; rank: number }> = {
    hot: { label: 'Hot', rank: 0 },
    warm: { label: 'Warm', rank: 1 },
    cold: { label: 'Cold', rank: 2 },
  };
  const sortedPendingAlerts = [...pendingAlerts]
    .filter(r => {
      const q = triageSearch.trim().toLowerCase();
      if (!q) return true;
      // Raw fields only — helpers like extractValue/getManifestTitle are declared
      // further down and would be in the temporal dead zone during a re-render.
      let meta: any = r.custom_metadata;
      if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
      const ci = meta?.['Client Information'] || {};
      const hay = [
        r.qn_number, r.qn,
        r.clients?.company_name,
        ci.client_name, ci.company_name, ci.contact_person,
        meta?.client_name,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => TEMP_META[quoteTemperature(a)].rank - TEMP_META[quoteTemperature(b)].rank);

  const extractMasterStatuses = () => {
    let options = new Set();
    blueprint.forEach(section => {
      section.fields.forEach(field => {
        if (field.type === 'master_status' && field.options) {
          field.options.split(',').forEach(opt => options.add(opt.trim()));
        }
      });
    });
    records.forEach(r => { if (r.status) options.add(r.status); });
    if (options.size === 0) { options.add("Inquiry"); options.add("Approved"); options.add("Lost"); }
    return Array.from(options);
  };

  const allStatuses = extractMasterStatuses();
  const statusLogSection = statusLogModule(allStatuses as string[]);

  useEffect(() => {
    if (!statusFilter && allStatuses.length > 0) {
      setStatusFilter(allStatuses[0]);
    }
  }, [allStatuses, statusFilter]);

  const tableColumns = [
    { label: "Client Name", name: "client_name" },
    { label: "Contact Person", name: "contact_person" },
    { label: "Amount", name: "subtotal", sectionTitle: "Quote Details" }
  ];

  const extractValue = (record, fieldName, sectionTitle) => {
    if (!record || !fieldName) return "";
    const targetKeys = [fieldName, ...(ALIASES[fieldName] || [])].map(normalize);
    const check = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      if (Array.isArray(obj)) { if (!obj.length) return null; obj = obj[0]; }
      for (const [k, v] of Object.entries(obj)) {
        if (v == null || v === "" || v === 0) continue;
        if (targetKeys.includes(normalize(k))) return v;
      }
      return null;
    };
    let val = null;
    if (record.custom_metadata) {
      if (sectionTitle) {
        const sk = Object.keys(record.custom_metadata).find(k => normalize(k).includes(normalize(sectionTitle)) || normalize(sectionTitle).includes(normalize(k)));
        if (sk) val = check(record.custom_metadata[sk]);
      }
      if (!val) {
        for (const section of Object.values(record.custom_metadata)) {
          val = check(section);
          if (val) break;
        }
      }
      if (!val) val = check(record.custom_metadata);
    }
    if (!val) val = check(record);
    if (!val) val = check(record.clients);
    return val || "";
  };

  const extractArray = (record, sectionTitle) => {
    if (!record || !sectionTitle) return [];
    const t = normalize(sectionTitle);
    if ((t.includes('status') || t.includes('log')) && record.status_logs?.length) {
      return record.status_logs;
    }
    if ((t.includes('product') || t.includes('item')) && record.quotation_items?.length) return record.quotation_items;
    if ((t.includes('attachment') || t.includes('file')) && record.quotation_attachments?.length) return record.quotation_attachments;
    if (record.custom_metadata) {
      const sk = Object.keys(record.custom_metadata).find(k => normalize(k) === t || normalize(k).includes(t));
      if (sk && Array.isArray(record.custom_metadata[sk])) return record.custom_metadata[sk];
    }
    return [];
  };

  /**
   * Every value ever typed into an ordinary field, across this workspace's whole quote history,
   * grouped by module and field key — so "Vardhman Textiles" suggests itself on Client Name the
   * moment there is one past quote for them, with nothing to configure. Recomputed only when the
   * record list or the form itself changes, never per keystroke, so typing stays instant even with
   * a large history.
   */
  const SUGGESTIBLE_TYPES = new Set(['text', 'number', 'date', 'dropdown', 'master_status']);
  const autoCapturedValues = useMemo(() => {
    const sets: Record<string, Record<string, Set<string>>> = {};
    blueprint.forEach((section: any) => {
      if (section.is_log) return;
      (section.fields || []).forEach((f: any) => {
        if (!SUGGESTIBLE_TYPES.has(f.type)) return;
        const bucket = (sets[section.title] ||= {})[f.name] ||= new Set<string>();
        records.forEach((r: any) => {
          if (section.allow_multiple) {
            extractArray(r, section.title).forEach((row: any) => {
              const v = extractValue(row, f.name);
              if (v && typeof v !== 'object' && v !== '-') bucket.add(String(v).trim());
            });
          } else {
            const v = extractValue(r, f.name, section.title);
            if (v && typeof v !== 'object' && v !== '-') bucket.add(String(v).trim());
          }
        });
      });
    });
    const out: Record<string, Record<string, string[]>> = {};
    Object.entries(sets).forEach(([sectionTitle, fields]) => {
      out[sectionTitle] = {};
      Object.entries(fields).forEach(([fieldName, set]) => { out[sectionTitle][fieldName] = Array.from(set); });
    });
    return out;
  }, [records, blueprint]);

  /**
   * The same client usually comes back on the same terms. Choosing a client you have quoted before
   * fills every empty field around it from their most recent quote — contact, email, phone, address,
   * terms — and says so, with an Undo. Line items, status, totals and the quote number are never copied.
   */
  const latestByClient = useMemo(() => {
    const byName = new Map<string, any>();
    const newestFirst = [...records].sort((a: any, b: any) => String(b.created_at || b.date || '').localeCompare(String(a.created_at || a.date || '')));
    newestFirst.forEach((r: any) => {
      const name = String(extractValue(r, 'client_name', 'Client Information') || r.clients?.company_name || '').trim().toLowerCase();
      if (name && !byName.has(name)) byName.set(name, r);
    });
    return byName;
  }, [records]);

  const [prefillNote, setPrefillNote] = useState<null | { client: string; qn: string; count: number; before: any }>(null);

  // ── Platform: the OK list badge, requests handed to the AI, saved quote views ──
  const [taskCounts, setTaskCounts] = useState<{ approvals: number; todos: number }>({ approvals: 0, todos: 0 });
  const [pendingAsk, setPendingAsk] = useState('');
  const [savedViews, setSavedViews] = useState<any[]>([]);
  const [activeViewId, setActiveViewId] = useState('');
  const [shareLink, setShareLink] = useState<null | { quoteId: string; url: string }>(null);
  const [studioTab, setStudioTab] = useState<'build' | 'automations' | 'saved' | 'health' | 'history'>('build');
  const [focusLeadId, setFocusLeadId] = useState('');
  const [teamTab, setTeamTab] = useState<'people' | 'planning' | 'chat'>('people');
  const [teamFocus, setTeamFocus] = useState('');
  const [inboxFilter, setInboxFilter] = useState<'all' | 'enquiries' | 'unread' | 'starred'>('all');
  const [emailLeads, setEmailLeads] = useState<Record<string, { id: string; kind: string; status: string; temperature: string; score: number }>>({});
  const openQuoteById = async (id: string) => {
    let rec = records.find((r: any) => r.id === id);
    if (!rec && tenantId) { await fetchRecords(tenantId); const { data } = await supabase.from('quotations').select('*, clients (*), quotation_items (*), quotation_attachments (*), status_logs (*)').eq('id', id).maybeSingle(); rec = data; }
    setCurrentView('pipeline');
    if (rec) setSelectedRecord(rec);
  };
  const loadTaskCounts = async () => {
    try { const r = await platformApi('/api/tasks?status=open&scope=mine'); setTaskCounts({ approvals: r.counts?.approvals || 0, todos: r.counts?.todos || 0 }); } catch { /* badge is optional */ }
  };
  const loadSavedViews = async () => {
    try { const r = await platformApi('/api/views'); setSavedViews(r.items || []); } catch { setSavedViews([]); }
  };
  useEffect(() => {
    if (!tenantId) return;
    loadTaskCounts(); loadSavedViews();
    const t = setInterval(loadTaskCounts, 60_000);
    return () => clearInterval(t);
  }, [tenantId]);
  /** Hand a request to Bloomgard AI on Home, as if it had been typed there. */
  const askAI = (prompt: string) => { setPendingAsk(prompt); setCurrentView('home'); };

  const prefillFromClient = (sectionTitle: string, fieldName: string, clientName: string) => {
    if (editingId) return; // revising a quote: never overwrite what it already says
    const rec = latestByClient.get(String(clientName || '').trim().toLowerCase());
    if (!rec || prefillNote?.client.toLowerCase() === clientName.toLowerCase()) return;
    const before = JSON.parse(JSON.stringify(dynamicData));
    before[sectionTitle] = { ...(before[sectionTitle] || {}), [fieldName]: clientName };
    const next = JSON.parse(JSON.stringify(before));
    let count = 0;
    blueprint.forEach((section: any) => {
      if (section.is_log || section.allow_multiple) return;
      (section.fields || []).forEach((f: any) => {
        if (PREFILL_SKIP_TYPES.has(f.type) || CLIENT_KEYS.has(normalize(f.name)) || PREFILL_SKIP_NAMES.test(f.name)) return;
        const cur = next[section.title]?.[f.name];
        if (cur != null && String(cur).trim() !== '') return;
        const v = extractValue(rec, f.name, section.title);
        if (v == null || v === '' || typeof v === 'object') return;
        next[section.title] = { ...(next[section.title] || {}), [f.name]: v };
        count++;
      });
    });
    if (!count) return;
    setDynamicData(next);
    setPrefillNote({ client: clientName, qn: rec.qn_number || rec.qn || '', count, before });
  };

  /** Line items already add up to the quote's value, so a subtotal nobody typed is not an unknown. */
  const itemsTotal = (record) => {
    const rows = record?.quotation_items || [];
    if (!rows.length) return null;
    const sum = rows.reduce((a, r) => a + (Number(r.item_br) || (Number(r.quantity) || 0) * (Number(r.item_rate) || 0)), 0);
    return sum > 0 ? sum : null;
  };

  const getFieldValue = (record, col) => {
    const isMoney = ['subtotal', 'total', 'amount', 'price', 'rate'].some(key => String(col.name).toLowerCase().includes(key));
    let v = extractValue(record, col.name, col.sectionTitle);
    if ((v === "" || v == null) && /subtotal|amount|^total$/i.test(String(col.name))) v = itemsTotal(record);
    if (v === "" || v == null) return "-";
    return isMoney ? money(v, extractValue(record, 'currency', 'Quote Details')) : formatValue(v, false);
  };

  const getManifestTitle = (record = selectedRecord) => {
    if (!record) return "CLIENT MANIFEST";
    const nested = extractValue(record, 'client_name', 'Client Information');
    if (nested) return String(formatValue(nested));
    if (record.client_name) return String(formatValue(record.client_name));
    if (record.clients?.company_name) return String(formatValue(record.clients.company_name));
    return "CLIENT MANIFEST";
  };

  const updateDynamicDataField = (sectionTitle, fieldName, value, rowIndex = null) => {
    setDynamicData(prev => {
      const nd = { ...prev };
      if (rowIndex !== null) {
        const arr = [...(nd[sectionTitle] || [])];
        if (arr[rowIndex]) {
          arr[rowIndex] = { ...arr[rowIndex], [fieldName]: value };
        }
        nd[sectionTitle] = arr;
      } else {
        nd[sectionTitle] = { ...(nd[sectionTitle] || {}), [fieldName]: value };
      }
      return nd;
    });
  };

  const handleSave = async () => {
    if (isSavingRecord) return;
    setIsSavingRecord(true);
    if (!tenantId) { setIsSavingRecord(false); return alert("No workspace connected. Contact your administrator."); }

    let maxNum = 0;
    records.forEach(r => {
      const m = r.qn_number?.match(/QN-\d+-(\d+)/i);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    });
    const autoGenQn = `QN-${new Date().getFullYear()}-${(maxNum + 1).toString().padStart(3, '0')}`;
    const generatedQn = qn || autoGenQn;

    if (!editingId && !qn) setQn(autoGenQn);
    let finalQn = generatedQn;
    if (editingId) {
      const cur = records.find(r => r.id === editingId);
      if (cur && cur.qn_number === generatedQn) { const m = generatedQn.match(/-Rev-(\d+)$/i); finalQn = m ? generatedQn.replace(/-Rev-\d+$/i, `-Rev-${parseInt(m[1]) + 1}`) : `${generatedQn}-Rev-1`; }
    }

    // Auto-calculate a follow up date 3 days from now if this is a brand new quote
    let computedFollowUpDate = null;
    if (!editingId) {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      computedFollowUpDate = d.toISOString().split('T')[0];
    }

    const creator = editingId ? records.find(r => r.id === editingId)?.created_by_email : (user?.email || "system@bloomgard.com");
    const clientName = extractValue({ custom_metadata: dynamicData }, 'client_name', 'Client Information') || "Unknown Client";
    let clientId = null;
    try {
      const cp = {
        tenant_id: tenantId,
        company_name: clientName,
        contact_person: extractValue({ custom_metadata: dynamicData }, 'contact_person', 'Client Information') || "",
        email_id: extractValue({ custom_metadata: dynamicData }, 'email_id', 'Client Information') || "",
        phone_number: extractValue({ custom_metadata: dynamicData }, 'phone_number', 'Client Information') || "",
        billing_address: extractValue({ custom_metadata: dynamicData }, 'billing_address', 'Client Information') || "",
        source_ref: extractValue({ custom_metadata: dynamicData }, 'source_ref', 'Client Information') || ""
      };
      const { data: ec } = await supabase.from('clients').select('id').eq('tenant_id', tenantId).eq('company_name', clientName).maybeSingle();
      if (ec) { clientId = ec.id; await supabase.from('clients').update(cp).eq('id', clientId); }
      else { const { data: nc } = await supabase.from('clients').insert([cp]).select('id').single(); if (nc) clientId = nc.id; }
    } catch (e) { }

    let masterStatusValue = allStatuses[0] || "Inquiry";
    if (editingId) {
      const existingQuote = records.find(r => r.id === editingId);
      if (existingQuote && existingQuote.status) masterStatusValue = existingQuote.status;
    }
    blueprint.forEach(sec => {
      sec.fields.forEach(f => {
        if (f.type === 'master_status') {
          if (!sec.is_log && !sec.allow_multiple && dynamicData[sec.title] && dynamicData[sec.title][f.name]) {
            masterStatusValue = dynamicData[sec.title][f.name];
          }
        }
      });
    });

    const quoteId = editingId || safeUUID();

    // Tables start with one blank row so there is something to type into. An untouched one is not
    // a record: saving it would show an empty line in the quote, the PDF and the exports.
    const savedData = { ...dynamicData };
    blueprint.filter(b => b.allow_multiple && !b.is_log).forEach(sec => {
      const rows = savedData[sec.title];
      if (!Array.isArray(rows)) return;
      savedData[sec.title] = rows.filter(row =>
        Object.entries(row || {}).some(([k, v]) => !k.startsWith('_') && v != null && String(v).trim() !== '' && String(v) !== '0'));
    });

    // Construct upsert payload
    const upsertPayload = {
      id: quoteId,
      tenant_id: tenantId,
      client_id: clientId,
      qn_number: finalQn,
      date,
      status: masterStatusValue,
      custom_metadata: savedData,
      created_by_email: creator
    };

    // Attach follow-up date only if it's new
    if (computedFollowUpDate) {
      upsertPayload.follow_up_due_date = computedFollowUpDate;
    }

    try {
      const { error } = await supabase.from("quotations").upsert([upsertPayload], { onConflict: 'id' });
      if (error) throw error;

      const items = [], atts = [];
      blueprint.filter(b => b.allow_multiple).forEach(sec => {
        const rows = savedData[sec.title] || [], lt = sec.title.toLowerCase();
        rows.forEach((row, i) => {
          if (lt.includes('product') || lt.includes('item')) items.push({ quotation_id: quoteId, display_order: i, item_name: row.item_name || `Item ${i + 1}`, item_code: row.item_code || "", quantity: Number(row.quantity || 0), uom: row.uom || "", item_rate: Number(row.item_rate || 0), item_br: Number(row.item_br || 0), custom_metadata: row });
          else if (lt.includes('attachment') || lt.includes('file') || lt.includes('document')) atts.push({ quotation_id: quoteId, file_name: row.file_name || row.att_name || `File ${i + 1}`, file_path: row.file_path || row.att || "" });
        });
      });
      if (editingId) {
        await supabase.from('quotation_items').delete().eq('quotation_id', editingId);
        await supabase.from('quotation_attachments').delete().eq('quotation_id', editingId);
      }
      if (items.length) await supabase.from('quotation_items').insert(items);
      if (atts.length) await supabase.from('quotation_attachments').insert(atts);

      // automations and plugins: a new quote, an edited one, and a status the form moved
      const before = editingId ? records.find(r => r.id === editingId) : null;
      emitClientEvent(editingId ? 'quote.updated' : 'quote.created', quoteId, { qn: finalQn });
      if (before && before.status !== masterStatusValue) {
        await supabase.from('status_logs').insert([{ quotation_id: quoteId, old_status: before.status, new_status: masterStatusValue, changed_by: user?.email || null, comments: 'Changed in the quote form' }]);
        emitClientEvent('quote.status_changed', quoteId, { from: before.status, to: masterStatusValue });
      }

      setEditingId(null);
      alert(`Successfully saved ${finalQn}!`);
      setCurrentView("pipeline");
      await fetchRecords(tenantId);
    } catch (err) { alert("Save Failed: " + err.message); }
    finally { setIsSavingRecord(false); }
  };

  const handleTriggerAgent = async (quote) => {
    setDispatchingId(quote.id);
    const defaultSnippet = `Hi ${extractValue(quote, 'contact_person', 'Client Information') || 'there'}, just following up on our recent quote (${quote.qn_number || quote.qn}). Let me know if you have any questions or need further clarification.`;
    const finalMessage = editedSnippets[quote.id] !== undefined ? editedSnippets[quote.id] : defaultSnippet;

    try {
      const res = await fetch(getApiUrl('/api/trigger-agent'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.id,
          tenantId: tenantId,
          agentEmail: user?.email,
          customMessage: finalMessage
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to trigger AI agent.");
      }

      alert(`AI Agent successfully dispatched for Quote ${quote.qn_number}`);
      await fetchRecords(tenantId); // Refresh to update the 'Agent Dispatched' status
    } catch (e) {
      alert("Error Dispatching Agent: " + e.message);
    } finally {
      setDispatchingId(null);
    }
  };

  const handleRunCoordinator = async () => {
    if (!tenantId) return;
    setIsRunningCoordinator(true);
    try {
      const res = await fetch(getApiUrl('/api/agent-coordinator'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Coordinator failed.");
      alert(data.message);
      await fetchRecords(tenantId);
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setIsRunningCoordinator(false);
    }
  };

  const handleSaveAgent = async (agentData) => {
    if (!tenantId) return alert("No workspace connected.");
    setIsSavingAgent(true);
    try {
      agentData.email = customSender || "";
      const isNew = !agentData.id;
      if (isNew) agentData.id = safeUUID();
      const updatedAgents = isNew ? [...agents, agentData] : agents.map(a => a.id === agentData.id ? agentData : a);

      const newSchemaConfig = [
        ...blueprint,
        { is_agent_config: true, agents: updatedAgents, title: "system_agents" },
        { ...aiSettings, is_ai_settings: true, title: "ai_settings" }
      ];

      const { error } = await supabase.from('tenant_schemas').update({ schema_config: newSchemaConfig }).eq('tenant_id', tenantId);
      if (error) throw error;

      if (agentData.assigned_quote_ids) {
        for (const quoteId of agentData.assigned_quote_ids) {
          const q = records.find(r => r.id === quoteId);
          if (q) {
            let meta = q.custom_metadata;
            if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }
            if (!meta) meta = {};
            meta.agent_id = agentData.id;
            await supabase.from('quotations').update({ custom_metadata: meta }).eq('id', quoteId);
          }
        }
        await fetchRecords(tenantId);
      }

      setAgents(updatedAgents);
      setEditingAgent(null);
    } catch (e) {
      alert("Error saving agent: " + e.message);
    } finally {
      setIsSavingAgent(false);
    }
  };

  const handleDeleteAgent = async (id) => {
    if (!confirm("Delete this agent?")) return;
    const updatedAgents = agents.filter(a => a.id !== id);
    const newSchemaConfig = [
      ...blueprint,
      { is_agent_config: true, agents: updatedAgents, title: "system_agents" },
      { ...aiSettings, is_ai_settings: true, title: "ai_settings" }
    ];
    await supabase.from('tenant_schemas').update({ schema_config: newSchemaConfig }).eq('tenant_id', tenantId);
    setAgents(updatedAgents);
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
      if (error) throw error;
      setTenantUsers(tenantUsers.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      alert("Error changing role: " + err.message);
    }
  };

  const handleResetPassword = async (targetUserId) => {
    if (!confirm("Reset this person's password? The new one is shown once.")) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch(getApiUrl('/api/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token || ''}` },
        body: JSON.stringify({ userId: targetUserId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Reset failed");
      const who = tenantUsers.find(u => u.id === targetUserId);
      setUserSecret({ email: who?.email || 'user', password: data.newPassword, kind: 'reset' });
    } catch (err) {
      alert("Error resetting password: " + err.message);
    }
  };


  const handleDelete = async (id) => {
    if (!confirm("Permanently delete this manifest?")) return;
    const { error } = await supabase.from("quotations").delete().eq("id", id);
    if (error) return alert("Deletion Error: " + error.message);
    setSelectedRecord(null); await fetchRecords(tenantId);
  };

  const updateStatus = async (id, newStatus) => {
    const targetRec = records.find(r => r.id === id) || selectedRecord;
    const oldStatus = targetRec?.status || "Inquiry";
    const { error } = await supabase.from("quotations").update({ status: newStatus }).eq("id", id);
    if (error) return alert("Status Error: " + error.message);
    const { data: newLog } = await supabase.from("status_logs").insert([{
      quotation_id: id,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: user?.email || null,
      comments: null
    }]).select().single();
    let updatedMetadata = statusIntoMetadata(targetRec, newStatus);

    // Promoting a Lead to any stage turns its AI-parsed items into real line items
    if (oldStatus === 'Lead' && newStatus !== 'Lead' && targetRec.custom_metadata?.ai_parsed_items?.length > 0) {
      const parsedItems = targetRec.custom_metadata.ai_parsed_items.map((ai, i) => {
        const qty = Number(ai.quantity) || 1, rate = Number(ai.unit_price ?? ai.item_rate) || 0;
        return { quotation_id: id, tenant_id: tenantId, display_order: i, item_name: ai.item_name || `Item ${i + 1}`, item_code: ai.item_code || '', quantity: qty, uom: ai.uom || '', item_rate: rate, item_br: qty * rate, custom_metadata: ai };
      });
      const { error: itemErr } = await supabase.from("quotation_items").insert(parsedItems);
      if (itemErr) console.error("Lead items:", itemErr);
    }

    // Save both the root status and the synchronized metadata back to the database
    const { error: metaError } = await supabase.from("quotations").update({
      status: newStatus,
      custom_metadata: updatedMetadata
    }).eq("id", id);
    if (metaError) console.error("Metadata Sync Error:", metaError);

    setSelectedRecord(p => p ? ({
      ...p,
      status: newStatus,
      custom_metadata: updatedMetadata,
      status_logs: p.status_logs ? [...p.status_logs, newLog] : [newLog]
    }) : null);
    await fetchRecords(tenantId);
    if (oldStatus !== newStatus) emitClientEvent('quote.status_changed', id, { from: oldStatus, to: newStatus });
  };

  const handleLogout = async () => {
    try { await supabase.auth.signOut({ scope: 'local' }); } catch (e) { console.error("Sign out error", e); }
    localStorage.clear();
    window.location.replace("/");
  };

  const handleExportData = (format) => {
    if (!visibleRecords.length) return alert("No data to export.");
    const stamp = new Date().toISOString().split('T')[0];
    const download = (blob: Blob, name: string) => { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    if (format === 'json') { download(new Blob([JSON.stringify(visibleRecords, null, 2)], { type: "application/json" }), `Bloomgard_quotes_${stamp}.json`); return; }
    // CSV: every column the Quotes table can show, so nothing on the form is left out
    const cols = quoteColumnDefs.filter((c) => c.id !== 'docs');
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = visibleRecords.map((r) => cols.map((c) => esc(columnValue(r, c.id))).join(','));
    download(new Blob(['\ufeff' + [cols.map((c) => esc(c.label)).join(','), ...rows].join('\n')], { type: "text/csv;charset=utf-8;" }), `Bloomgard_quotes_${stamp}.csv`);
  };

  const handleImportData = async (event) => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try { const d = JSON.parse(e.target?.result); const s = d.map(r => ({ ...r, id: safeUUID(), tenant_id: tenantId, created_by_email: user?.email })); const { error } = await supabase.from("quotations").insert(s); if (error) throw error; alert(`Imported ${s.length} records.`); await fetchRecords(tenantId); }
      catch (err) { alert("Import Failed: " + err.message); }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const COLORS = ["#1F2937", "#4F46E5", "#10B981", "#F59E0B", "#EF4444"];
  const perfData = Object.entries(visibleRecords.reduce((acc, curr) => { const n = (curr.created_by_email || "").includes('@') ? curr.created_by_email.split('@')[0] : "Agent"; acc[n] = (acc[n] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value: Number(value) }));
  /** A quote's value as a number: its subtotal, or what its line items add up to. */
  const amountOf = (r: any) => {
    const v = extractValue(r, 'subtotal', 'Quote Details');
    const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : (itemsTotal(r) || 0);
  };
  const quietDays = (r: any) => {
    const last = r.last_contact_date || r.date || r.created_at;
    return last ? (Date.now() - new Date(last).getTime()) / 86400000 : 0;
  };
  /* ── Quotes list: columns, filters, sort and saved views ────────────────────────────────────
   * The table shows whichever columns the person picked, in their order (any field of the quote
   * form can be one). Filters, columns and sort together can be saved as a view: a tab above the
   * table that brings that exact list back in one click. Without a view, the choice is remembered
   * in this browser. */
  const DEFAULT_QUOTE_COLUMNS = ['ref', 'client', 'contact', 'amount', 'owner', 'status', 'docs'];
  const quoteColumnDefs = useMemo(() => {
    const builtins = [
      { id: 'ref', label: 'Ref ID', group: 'Quote' },
      { id: 'date', label: 'Date', group: 'Quote' },
      { id: 'client', label: 'Client', group: 'Quote' },
      { id: 'contact', label: 'Contact person', group: 'Quote' },
      { id: 'amount', label: 'Amount', group: 'Quote' },
      { id: 'items', label: 'Line items', group: 'Quote' },
      { id: 'owner', label: 'Created by', group: 'Quote' },
      { id: 'status', label: 'Status', group: 'Quote' },
      { id: 'quiet', label: 'Days quiet', group: 'Quote' },
      { id: 'last_contact', label: 'Last contact', group: 'Quote' },
      { id: 'follow_up', label: 'Follow-up', group: 'Quote' },
      { id: 'docs', label: 'Document', group: 'Quote' },
    ];
    const fields = blueprint
      .filter((sec: any) => !sec.is_log && !sec.allow_multiple && sec.title.toLowerCase() !== 'status logs')
      .flatMap((sec: any) => (sec.fields || [])
        .filter((f: any) => !['file', 'attachment', 'master_status'].includes(f.type))
        .map((f: any) => ({ id: `f:${sec.title}::${f.name}`, label: f.label || f.name, group: sec.title })));
    return [...builtins, ...fields];
  }, [blueprint]);
  const colsKey = `bg.quotes.columns.${tenantId || ''}`;
  const [quoteFilters, setQuoteFilters] = useState<any>({});
  const [quoteColumns, setQuoteColumnsState] = useState<string[]>(DEFAULT_QUOTE_COLUMNS);
  const [quoteSort, setQuoteSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  useEffect(() => {
    if (!tenantId) return;
    try { const v = JSON.parse(localStorage.getItem(colsKey) || 'null'); if (Array.isArray(v) && v.length) setQuoteColumnsState(v); } catch { /* private window: defaults */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);
  const setQuoteColumns = (ids: string[]) => {
    setQuoteColumnsState(ids);
    if (!activeViewId) { try { localStorage.setItem(colsKey, JSON.stringify(ids)); } catch { /* not remembered, still applied */ } }
  };
  const activeView = currentView === 'pipeline' ? savedViews.find((v) => v.id === activeViewId) : null;
  /** Open a saved view (or '' for All quotes): its filters, columns and sort replace the current ones. */
  const openView = (id: string) => {
    setActiveViewId(id);
    const v = savedViews.find((x) => x.id === id);
    if (!v) {
      setQuoteFilters({});
      let cols = DEFAULT_QUOTE_COLUMNS;
      try { const c = JSON.parse(localStorage.getItem(colsKey) || 'null'); if (Array.isArray(c) && c.length) cols = c; } catch { /* defaults */ }
      setQuoteColumnsState(cols); setQuoteSort({ key: 'date', dir: 'desc' });
      return;
    }
    setQuoteFilters({ ...(v.filters || {}) });
    if (Array.isArray(v.columns) && v.columns.length) setQuoteColumnsState(v.columns);
    setQuoteSort(v.sort?.key ? { key: v.sort.key, dir: v.sort.dir || 'desc' } : { key: 'date', dir: 'desc' });
  };
  const clean = (f: any) => JSON.stringify(Object.fromEntries(Object.entries(f || {}).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)).sort()));
  const viewChanged = !!activeView && (clean(activeView.filters) !== clean(quoteFilters)
    || (Array.isArray(activeView.columns) && activeView.columns.length ? activeView.columns.join() !== quoteColumns.join() : quoteColumns.join() !== DEFAULT_QUOTE_COLUMNS.join())
    || (activeView.sort?.key || 'date') !== quoteSort.key || (activeView.sort?.dir || 'desc') !== quoteSort.dir);

  const quoteDate = (r: any) => String(r.date || r.quote_date || r.created_at || '').slice(0, 10);
  const lineItems = (r: any) => extractArray(r, 'Products').length ? extractArray(r, 'Products') : (r.quotation_items || []);
  /** The plain value of a column, for sorting and export. */
  const columnValue = (r: any, id: string): any => {
    switch (id) {
      case 'ref': return r.qn_number || r.qn || '';
      case 'date': return quoteDate(r);
      case 'client': return extractValue(r, 'client_name', 'Client Information') || r.clients?.company_name || '';
      case 'contact': return extractValue(r, 'contact_person', 'Client Information') || '';
      case 'amount': return amountOf(r);
      case 'items': return lineItems(r).length;
      case 'owner': return r.created_by_email || '';
      case 'status': return r.status || 'Inquiry';
      case 'quiet': return Math.floor(quietDays(r));
      case 'last_contact': return String(r.last_contact_date || '').slice(0, 10);
      case 'follow_up': return r.follow_up_status || '';
      case 'docs': return '';
      default: {
        if (!id.startsWith('f:')) return '';
        const [sec, name] = id.slice(2).split('::');
        const v = extractValue(r, name, sec);
        return v == null || typeof v === 'object' ? '' : v;
      }
    }
  };
  /** The quote as text, for "find anything": every field, line item, note and log entry. */
  const searchText = useMemo(() => {
    const m = new Map<string, string>();
    records.forEach((r: any) => {
      const { quotation_attachments, ...rest } = r;
      // attachments can be base64 files: never search inside those
      const meta = rest.custom_metadata ? JSON.stringify(rest.custom_metadata, (k, v) => (typeof v === 'string' && v.length > 2000 ? '' : v)) : '';
      m.set(r.id, (JSON.stringify({ ...rest, custom_metadata: undefined }) + meta).toLowerCase());
    });
    return m;
  }, [records]);   // built once per load, not on every keystroke
  const matchesFilters = (r: any, f: any) => {
    if (f.search && !(searchText.get(r.id) || '').includes(String(f.search).toLowerCase())) return false;
    if (f.statuses?.length && !f.statuses.map((x: string) => x.toLowerCase()).includes(String(r.status || 'Inquiry').toLowerCase())) return false;
    if (f.created_by) { const who = f.created_by === 'me' ? user?.email : f.created_by; if (String(r.created_by_email || '').toLowerCase() !== String(who || '').toLowerCase()) return false; }
    if (f.client_contains && !String(columnValue(r, 'client')).toLowerCase().includes(String(f.client_contains).toLowerCase())) return false;
    if (f.date_from && quoteDate(r) < f.date_from) return false;
    if (f.date_to && quoteDate(r) > f.date_to) return false;
    if (f.min_amount != null && amountOf(r) < Number(f.min_amount)) return false;
    if (f.max_amount != null && amountOf(r) > Number(f.max_amount)) return false;
    if (f.quiet_days != null && quietDays(r) < Number(f.quiet_days)) return false;
    return true;
  };
  // the status chips count what the other filters leave, so the numbers always add up
  const beforeStatus = visibleRecords.filter((r: any) => matchesFilters(r, { ...quoteFilters, statuses: undefined }));
  const statusCounts = beforeStatus.reduce((acc: Record<string, number>, r: any) => { const k = r.status || 'Inquiry'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const sortedRecords = beforeStatus
    .filter((r: any) => matchesFilters(r, { statuses: quoteFilters.statuses }))
    .sort((a: any, b: any) => {
      // numbers compare as numbers: ₹90,000 is less than ₹1,69,000
      const key = ({ subtotal: 'amount' } as any)[quoteSort.key] || quoteSort.key;
      let av: any = columnValue(a, key), bv: any = columnValue(b, key);
      const an = typeof av === 'number' ? av : parseFloat(String(av).replace(/[^0-9.-]/g, ''));
      const bn = typeof bv === 'number' ? bv : parseFloat(String(bv).replace(/[^0-9.-]/g, ''));
      if (key !== 'ref' && key !== 'date' && key !== 'last_contact' && Number.isFinite(an) && Number.isFinite(bn) && String(av).trim() !== '' && String(bv).trim() !== '') { av = an; bv = bn; }
      else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
      if (av === bv) return 0;
      return quoteSort.dir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  const sortBy = (id: string) => setQuoteSort((s) => (s.key === id ? { key: id, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: id, dir: ['amount', 'quiet', 'date', 'items'].includes(id) ? 'desc' : 'asc' }));

  /** Save what the list shows now (filters, columns, sort) as a view: a tab that brings it back. */
  const saveCurrentAsView = async (update = false) => {
    const name = update && activeView ? activeView.name : prompt('Name this view (for example "My open quotes" or "Big quiet ones"):');
    if (!name?.trim()) return;
    try {
      const data = { filters: JSON.parse(clean(quoteFilters)), columns: quoteColumns, sort: quoteSort, shared: update && activeView ? !!activeView.shared : false };
      const r = await platformApi('/api/views', { json: { ...(update && activeView ? { id: activeView.id } : {}), name: name.trim(), data } });
      await loadSavedViews(); setActiveViewId(r.id);
    } catch (e: any) { alert(e.message); }
  };
  const deleteView = async () => {
    if (!activeView || !confirm(`Delete the view “${activeView.name}”? The quotes in it are not touched.`)) return;
    try { await platformApi(`/api/views?id=${activeView.id}`, { method: 'DELETE' }); await loadSavedViews(); openView(''); }
    catch (e: any) { alert(e.message); }
  };

  const handleSendChatAI = async (overrideMsg = null) => {
    const msg = typeof overrideMsg === 'string' ? overrideMsg : currentInput;
    if (!msg.trim() || !tenantId) return;
    setCurrentInput("");
    setChatHistory(p => [...p, { role: 'user', content: msg }]); setIsThinking(true);

    // 1. Comprehensive Quotes & Client Follow-up Trajectory
    const quotesData = visibleRecords.map(r => {
      const rawItems = extractArray(r, 'Quotation Items') || extractArray(r, 'Products') || [];
      const cleanProducts = rawItems.map(item => ({
        name: item.item_name || item.name || "Unknown Item",
        qty: Number(item.quantity || item.qty || 0),
        price: Number(item.item_rate || item.price || 0),
        total: Number(item.item_br || 0),
        gsm: item.gsm || "Unknown",
        gst: item.gst || "Unknown",
        application: item.application || "Unknown"
      }));

      const statusHistory = (r.status_logs || []).slice(0, 5).map((log: any) => ({
        from: log.old_status,
        to: log.new_status,
        comments: log.comments,
        date: log.created_at ? new Date(log.created_at).toISOString().split('T')[0] : ""
      }));

      return {
        quote_ref: r.qn_number || r.qn || r.id,
        date: r.date,
        status: r.status,
        follow_up_status: r.follow_up_status || r.custom_metadata?.follow_up_status || "No Follow-up Yet",
        last_contact_date: r.last_contact_date || r.updated_at || r.date,
        client_name: extractValue(r, 'client_name', 'Client Information') || r.client_name || "Unknown Client",
        client_email: extractValue(r, 'email', 'Client Information') || r.email || "",
        amount: getFieldValue(r, { name: 'subtotal' }) !== '-' ? getFieldValue(r, { name: 'subtotal' }) : getFieldValue(r, { name: 'total' }),
        source: extractValue(r, 'source_ref', 'Client Information') || "Unknown",
        agent: r.created_by_email,
        products: cleanProducts,
        status_history: statusHistory
      };
    });

    // 2. Inbound Inbox Emails
    const inboxData = (inboxLogs || []).filter((e: any) => !e.is_deleted).slice(0, 25).map((e: any) => ({
      id: e.id,
      from: e.from_email || e.sender,
      subject: e.subject,
      date: e.received_at || e.date,
      snippet: (e.body_text || e.preview || "").slice(0, 200),
      ai_sentiment: e.ai_sentiment,
      extracted_intent: e.extracted_intent,
      urgency: e.urgency_score,
      assigned_to: e.assigned_to_email
    }));

    // 3. Master Data Settings
    const masterDataSummary = {
      manual_keys: (masterTree || []).map(m => ({
        key: m.key_name,
        configured_values: m.values?.map(v => v.value_text) || [],
        nested_children: m.children?.map(c => c.key_name) || []
      })),
      auto_captured_keys: (autoMasterTree || []).map(m => ({
        key: m.key_name,
        ai_description: m.ai_description || "Auto-extracted from inbound emails"
      }))
    };

    try {
      const res = await fetch(getApiUrl('/api/ask-ai'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: msg,
          context: {
            quotes: quotesData,
            inbox: inboxData,
            masterData: masterDataSummary
          }
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      setChatHistory(p => [...p, { role: 'ai', content: result.answer || "No response received." }]);
    } catch (e) {
      setChatHistory(p => [...p, { role: 'ai', content: `Network error: ${e.message}.` }]);
    } finally { setIsThinking(false); }
  };

  const handleGenerateDashInsights = async () => {
    if (!dashCommand.trim() || !tenantId) return; setIsBuildingDash(true);
    const instruction = `CRITICAL: Return ONLY a valid JSON object. Do not return arrays or markdown. 
Format: {"intent": "pie_chart"|"bar_chart"|"line_chart"|"metric", "title": "Chart Title", "metric": "count"|"value", "dimension": "status"|"agent"|"client"|"source"|"date"}.
Examples: 
- "Total revenue by agent" -> {"intent":"bar_chart","title":"Revenue by Agent","metric":"value","dimension":"agent"}
- "Pie chart of quote statuses" -> {"intent":"pie_chart","title":"Quote Status Distribution","metric":"count","dimension":"status"}
Command: ${dashCommand}`;

    const lightweightData = visibleRecords.map(r => {
      const valStr = getFieldValue(r, { name: 'subtotal' }) || getFieldValue(r, { name: 'total' }) || "0";
      const numVal = parseFloat(String(valStr).replace(/[^0-9.]/g, '')) || 0;
      return {
        id: r.qn_number || r.qn,
        status: r.status,
        date: r.date,
        value: numVal,
        agent: r.created_by_email,
        client: (extractValue(r, 'client_name', 'Client Information') || "Unknown").slice(0, 20),
        source: extractValue(r, 'source_ref', 'Client Information') || "Unknown"
      };
    });

    try {
      const res = await fetch(getApiUrl('/api/ask-ai'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: instruction, data: [] }) // We don't need to send the whole data array anymore, just the prompt
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();

      let raw = result.answer || "";
      const oi = raw.indexOf('{'); const oei = raw.lastIndexOf('}');
      if (oi !== -1 && oei > oi) raw = raw.substring(oi, oei + 1);

      const intentData = JSON.parse(raw);
      const { intent, metric, dimension, title } = intentData;

      // Local Frontend Math Calculation
      let aggregated = {};

      lightweightData.forEach(r => {
        let dimValue = r[dimension] || 'Unknown';
        if (dimension === 'date' && r.date) {
          dimValue = r.date.split('T')[0];
        }
        if (dimension === 'agent' && dimValue.includes('@')) {
          dimValue = dimValue.split('@')[0];
        }

        const amount = metric === 'value' ? (r.value || 0) : 1;

        if (!aggregated[dimValue]) aggregated[dimValue] = 0;
        aggregated[dimValue] += amount;
      });

      let chartData = Object.keys(aggregated).map(k => ({ name: String(k).slice(0, 15), value: Number(aggregated[k]) }));
      chartData.sort((a, b) => b.value - a.value);
      chartData = chartData.slice(0, 10);

      if (chartData.length === 0) chartData = [{ name: 'No Data', value: 1 }];

      const totalVal = chartData.reduce((a, b) => a + b.value, 0);
      const displayValue = metric === 'value' ? `$${totalVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : totalVal.toString();

      const { data: saved } = await supabase.from("ai_insights").insert([{
        tenant_id: tenantId,
        title: title || "Insight",
        value: displayValue,
        type: intent || "metric",
        data: chartData
      }]).select().single();

      if (saved) setDynamicInsights(p => [saved, ...p]);
      setDashCommand("");
    } catch (e) { console.error(e); alert("AI error: " + e.message); }
    finally { setIsBuildingDash(false); }
  };

  const removeInsightCard = async (id) => { const { error } = await supabase.from("ai_insights").delete().eq("id", id); if (!error) setDynamicInsights(p => p.filter(i => i.id !== id)); };
  const formatAIText = (text) => {
    if (!text) return null;
    return <div className="space-y-2">{text.split('\n').map((line, i) => <p key={i} className="last:mb-0">{line.split(/(\*\*.*?\*\*)/g).map((part, j) => part.startsWith('**') ? <strong key={j} className="font-bold text-gray-900">{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>)}</p>)}</div>;
  };

  const downloadDirectPDF = async (html, name) => {
    try {
      const printWindow = window.open('', '_blank', 'width=800,height=900');
      if (!printWindow) {
        alert("Please allow pop-ups to print the document.");
        return;
      }
      printWindow.document.open();
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${name}</title>
            <style>
              @page { size: A4; margin: 0; }
              body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
            </style>
          </head>
          <body>
            ${html}
            <script>
              window.onload = () => {
                setTimeout(() => {
                  window.print();
                  setTimeout(() => window.close(), 500);
                }, 500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      alert('Print Error: ' + err.message);
    }
  };

  const getRenderedHTML = async (record) => {
    const { data: schema } = await supabase.from("tenant_schemas").select("html_template").eq("tenant_id", tenantId).single();
    let html = schema?.html_template || "";
    let templateData = {};

    Object.entries(record).forEach(([k, v]) => {
      if (typeof v !== 'object') {
        templateData[k] = v;
      }
    });

    blueprint.forEach(section => {
      if (!section.allow_multiple) {
        section.fields.forEach(f => {
          templateData[f.name] = extractValue(record, f.name, section.title) ?? "";
        });
      } else {
        const rawItems = extractArray(record, section.title);
        const normalizedItems = rawItems.map(item => {
          let flat = { ...item };
          let meta = item.custom_metadata;
          if (typeof meta === 'string') {
            try { meta = JSON.parse(meta); } catch (e) { meta = {}; }
          }
          if (meta && typeof meta === 'object') {
            const lowerMeta = {};
            Object.entries(meta).forEach(([k, v]) => { lowerMeta[k.toLowerCase()] = v; });
            Object.entries(lowerMeta).forEach(([k, v]) => {
              if (flat[k] == null || flat[k] === '' || flat[k] === 0) flat[k] = v;
            });
            flat = { ...lowerMeta, ...flat };
          }
          const rootLower = {};
          Object.entries(flat).forEach(([k, v]) => { rootLower[k.toLowerCase()] = v; });
          flat = { ...rootLower, ...flat };
          if (flat.gst != null && flat.gst !== '') {
            flat.gst = String(flat.gst).replace(/%/g, '').trim();
            if (flat.gst === '0' || flat.gst === '') flat.gst = null;
          }
          return flat;
        });
        // {{#each quotation_items}} means the line items. Every table used to overwrite it in turn,
        // so a form with a second table (Official Documents) left the PDF's item rows empty.
        const t = section.title.toLowerCase();
        if (t.includes('product') || t.includes('item')) templateData['quotation_items'] = normalizedItems;
        else if (!templateData['quotation_items']) templateData['quotation_items'] = normalizedItems;
        templateData[section.title] = normalizedItems;
      }
    });

    templateData['subtotal'] = formatValue(record.subtotal || extractValue(record, 'subtotal', 'Quote Details') || itemsTotal(record) || "0", true);
    // {{currency}} is the code (INR, USD…), {{currency_symbol}} its sign, {{subtotal_money}} the amount with it
    const cur = currencyCode(extractValue(record, 'currency', 'Quote Details'));
    templateData['currency'] = cur;
    templateData['currency_symbol'] = CURRENCIES[cur].symbol.trim();
    templateData['subtotal_money'] = money(record.subtotal || extractValue(record, 'subtotal', 'Quote Details') || itemsTotal(record) || 0, cur);
    templateData['company_logo'] = logoUrl || "";

    try {
      if (!Handlebars.helpers['math']) {
        Handlebars.registerHelper('math', (a, op, b) => {
          a = parseFloat(a); b = parseFloat(b);
          let result = a;
          if (op === '+') result = a + b;
          if (op === '-') result = a - b;
          if (op === '*') result = a * b;
          if (op === '/') result = b !== 0 ? a / b : 0;
          return Number(result).toFixed(2);
        });
      }
      const compiler = Handlebars.compile(html);
      return compiler(templateData);
    } catch (e) {
      console.error("Handlebars Error:", e);
      return html;
    }
  };

  const handleGeneratePDF = async (r) => {
    const newMetadata = { ...r.custom_metadata, has_pdf_generated: true };
    await supabase.from("quotations").update({ custom_metadata: newMetadata }).eq('id', r.id);
    fetchRecords(tenantId);
    downloadDirectPDF(await getRenderedHTML(r), `${r.qn_number} - ${getManifestTitle(r)}`);
  };

  const handleViewDocument = async (r) => { setViewingDoc({ html: await getRenderedHTML(r), title: `${r.qn_number} - ${getManifestTitle(r)}` }); };

  const handleOpenEmailComposer = async (r: any) => {
    const name = `${r.qn_number} - ${getManifestTitle(r)}`;

    // Auto-attach the document as a real PDF
    const html = await getRenderedHTML(r);

    // Dynamically import html2pdf to prevent SSR errors
    const html2pdf = (await import('html2pdf.js')).default;

    // Configure html2pdf to output a data URI string
    const opt = {
      margin: 0.5,
      filename: `${name}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    // Generate the PDF
    const pdfBase64 = await html2pdf().set(opt).from(html).output('datauristring');

    setEmailDraft({
      quoteId: r.id,
      quoteData: r,
      status: r.status,
      to: "",
      cc: "",
      bcc: "",
      subject: `Document: ${name}`,
      message: `Hello,\n\nPlease find the attached official document.\n\nBest regards,\n${user?.email}`,
      attachments: [{ filename: `${name}.pdf`, base64: pdfBase64 }],
      filename: `${name}.pdf`
    } as any);
    setShowEmailModal(true);
  };

  const handleGenerateEmailDraft = async () => {
    setIsGeneratingDraft(true);
    try {
      const payload = {
        question: "Draft a highly professional, concise email to send this quote/document to the client. Do NOT include a subject line. Just the email body.",
        context: JSON.stringify(emailDraft.quoteData || {}),
        tone: aiSettings?.tone || 'Professional',
        englishLevel: aiSettings?.englishLevel || 'Native',
        desperation: aiSettings?.desperation || 'Low',
        companyName: companyName || "Our Company"
      };
      const res = await fetch(getApiUrl('/api/ask-ai'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate AI draft");

      setEmailDraft(prev => ({
        ...prev,
        message: data.answer
      }));
    } catch (e) {
      alert("AI Generation Failed: " + e.message);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const sendDraftedEmail = async () => {
    setIsSending(true);
    try {
      const url = getApiUrl('/api/send-quote');
      const payload = {
        to: emailDraft.to,
        subject: emailDraft.subject,
        message: emailDraft.message,
        attachments: emailDraft.attachments || [],
        agentEmail: user?.email,
        agentId: user?.id,
        senderPreference: emailSenderPref,
        tenantId: tenantId,
        companyName: companyName || "",
        customSender: customSender || ""
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });

      const responseText = await res.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Parse Error: ${responseText.slice(0, 40)}...`);
      }

      if (!res.ok || !responseData.success) {
        throw new Error(responseData.error || "Server failed to send.");
      }

      // Auto-transition status if an attachment is sent and it's currently an Inquiry
      if (emailDraft.attachments?.length > 0 && emailDraft.quoteId && (!emailDraft.status || emailDraft.status === "Inquiry")) {
        await updateStatus(emailDraft.quoteId, "Quotation Given");
      }

      alert("Email sent successfully!");
      setShowEmailModal(false);

    } catch (e) {
      alert("Delivery Failed: " + e.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleAnalyzeEmail = async (email) => {
    setIsAnalyzingEmail(true);
    try {
      const json = await platformApi('/api/ai/analyze-email', { json: { email, blueprint } }).catch((e) => ({ error: e.message }));
      if (json.data) {
        setEmailAiAnalysis(prev => ({ ...prev, [email.id]: json.data }));
      } else {
        alert(json.error || "Analysis failed.");
      }
    } catch (e) {
      alert("Analysis failed: " + e.message);
    } finally {
      setIsAnalyzingEmail(false);
    }
  };

  const [isCreatingQuoteFromEmail, setIsCreatingQuoteFromEmail] = useState(false);
  const handleCreateQuoteFromEmail = async (email, analysis) => {
    if (!analysis?.lead_gen_quote) return alert("Run 'Generate AI Actions' first.");
    setIsCreatingQuoteFromEmail(true);
    try {
      // signed in: the workspace and owner come from the session, not the request
      const json = await platformApi('/api/quote-from-email', { json: { emailId: email.id, analysis } }).catch((e) => ({ error: e.message }));
      if (json.success) {
        await fetchRecords(tenantId);
        if (confirm(`Created ${json.qn_number} with ${json.itemCount} item(s). Open it now?`)) {
          const rec = (records || []).find(r => r.qn_number === json.qn_number);
          if (rec) loadRecordForEditing(rec);
          setCurrentView('pipeline');
        }
      } else {
        alert('Failed: ' + (json.error || 'unknown error'));
      }
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setIsCreatingQuoteFromEmail(false);
    }
  };

  const loadRecordForEditing = (rec) => {
    setEditingId(rec.id);
    setQn(rec.qn_number);
    setDate(rec.date || new Date().toISOString().split('T')[0]);
    let d = { ...(rec.custom_metadata || {}) };

    blueprint.forEach(sec => {
      if (sec.is_log) { d[sec.title] = Array.isArray(rec.custom_metadata?.[sec.title]) ? rec.custom_metadata[sec.title] : []; return; }
      if (sec.allow_multiple) {
        d[sec.title] = extractArray(rec, sec.title).map(item => {
          let meta = item.custom_metadata;
          if (typeof meta === 'string') {
            try { meta = JSON.parse(meta); } catch (e) { meta = {}; }
          }
          const rowState = { ...(meta || {}), ...item };
          sec.fields.forEach(f => {
            const val = formatValue(extractValue({ ...item, custom_metadata: meta }, f.name, sec.title));
            if (val !== "" && val != null) { rowState[f.name] = val; }
          });
          return rowState;
        });
      } else {
        if (!d[sec.title]) d[sec.title] = {};
        sec.fields.forEach(f => {
          const val = formatValue(extractValue(rec, f.name, sec.title));
          if (val !== "" && val != null) { d[sec.title][f.name] = val; }
          else if (d[sec.title][f.name] == null) { d[sec.title][f.name] = ""; }
        });
      }
    });
    setDynamicData(d);
    setSelectedRecord(null);
    setCurrentView("new_entry");
  };

  if (authState === 'checking' || loading) return <JaaliLoader />;

  if (authState === 'unauthed') return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <p className="font-semibold text-[12px] tracking-widest text-gray-500 uppercase animate-pulse">Redirecting...</p>
    </div>
  );

  const isGlass = false; // photo wallpapers / glass mode were removed with the Jaali skin
  const isDark = userPreferences.theme === 'dark';

  return (
    <div className={`${JAALI_UI ? 'jaali' : ''} flex min-h-screen font-sans transition-colors duration-500 ${isDark ? 'dark text-gray-100' : 'text-gray-800'} ${isGlass ? 'glass-mode !bg-transparent' : 'bg-gray-50 dark:bg-[#030712]'}`}>
      {!isMobileMenuOpen && !selectedRecord && !viewingDoc && !showEmailModal && (
        <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden fixed top-4 left-4 z-40 p-3 bg-gray-900 text-white rounded-lg shadow-md active:scale-95 transition-transform"><Menu className="w-5 h-5" /></button>
      )}
      {isMobileMenuOpen && <div onClick={() => setIsMobileMenuOpen(false)} className="md:hidden fixed inset-0 bg-black/50 z-[90] backdrop-blur-sm transition-opacity"></div>}

      <aside className={`fixed inset-y-0 left-0 z-[100] w-60 flex flex-col border-r transition-transform duration-300 ease-in-out overflow-hidden rounded-none
        ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}
        ${isDark ? 'bg-[#121628] border-[#262c47]' : 'bg-white border-gray-200'}`}>
        <div className="px-4 pt-6 pb-4 border-b border-gray-100">
          <h1 className="text-gray-900"><BrandLockup height={25} /></h1>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-1">{companyName || "Workspace"}</p>
        </div>
        <nav className="flex-1 px-3 space-y-1 mt-3 overflow-y-auto scrollbar-hide">
          {[
            ['home', <div key='home' className='flex items-center gap-2'><Sparkles className='w-4 h-4' /> Home</div>],
            ['pipeline', <div key='pipeline' className='flex items-center gap-2'><Rocket className='w-4 h-4' /> Quotes</div>],
            ['inbox', <div key='inbox' className='flex items-center gap-2'><Inbox className='w-4 h-4' /> Inbox</div>],
            ['alerts', <div key='alerts' className='flex items-center gap-2'><Bell className='w-4 h-4' /> Follow ups</div>],
            ['tasks', <div key='tasks' className='flex items-center gap-2'><CheckSquare className='w-4 h-4' /> OK list</div>],
            ['leadgen', <div key='leadgen' className='flex items-center gap-2'><Magnet className='w-4 h-4' /> Lead Gen</div>],
            ['docs', <div key='docs' className='flex items-center gap-2'><FileText className='w-4 h-4' /> Docs</div>],
            // everyone plans and chats; People & activity inside it is for managers and admins
            ['team', <div key='team' className='flex items-center gap-2'><UsersRound className='w-4 h-4' /> Team</div>],
            ['studio', <div key='studio' className='flex items-center gap-2'><Wand2 className='w-4 h-4' /> Studio</div>],
            ['settings', <div key='settings' className='flex items-center gap-2'><Settings className='w-4 h-4' /> Settings</div>]
          ].map(([v, label]) => (
            <div key={v} onClick={() => { setCurrentView(v); setIsMobileMenuOpen(false); }} className={`flex items-center justify-between pl-3 pr-4 py-2.5 rounded-md cursor-pointer transition-colors font-semibold text-sm border-l-2 ${currentView === v ? 'bg-gray-100 text-gray-900 border-[var(--sindoor)]' : 'text-gray-600 border-transparent hover:bg-gray-50 hover:text-gray-900'}`}>
              <span>{label}</span>
              {v === 'tasks' && taskCounts.approvals + taskCounts.todos > 0 && (
                <span className="nav-count" aria-label={`${taskCounts.approvals} approvals and ${taskCounts.todos} to-dos open`}>{taskCounts.approvals + taskCounts.todos}</span>
              )}
            </div>
          ))}
          {/* The old standalone 'Bloomgard AI' link is gone: Home is the assistant now. */}
        </nav>
        <div className="p-4 border-t border-gray-200 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center text-gray-700 text-xs font-bold uppercase border border-gray-300">{user?.email?.charAt(0) || 'O'}</div>
            <div className="overflow-hidden flex-1">
              <p className="text-[11px] font-semibold truncate text-gray-900 dark:text-gray-900">{user?.email || 'Operator'}</p>
              <p className="text-[9px] text-gray-500 uppercase font-medium tracking-widest mt-0.5">{user?.role || "Operator"}</p>
            </div>
            {tenantId && (
              <NotificationBell onNavigate={(link) => {
                setIsMobileMenuOpen(false);
                if (link.quote_id) {
                  const rec = records.find((r: any) => r.id === link.quote_id);
                  setCurrentView(link.view === 'pipeline' || !link.view ? 'pipeline' : link.view);
                  if (rec) setSelectedRecord(rec);
                  return;
                }
                if (link.view === 'leadgen') { setFocusLeadId(link.sub || ''); setCurrentView('leadgen'); return; }
                if (link.view === 'team') { const t = String(link.sub || '').split(':')[0]; if (t === 'chat' || t === 'planning') setTeamTab(t); setTeamFocus(link.sub || ''); setCurrentView('team'); return; }
                if (link.sub) { setSettingsSubView(link.sub); setCurrentView('settings'); return; }
                setCurrentView(link.view || 'home');
              }} />
            )}
          </div>
          <button onClick={handleLogout} className="w-full py-2.5 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold uppercase tracking-wider border border-red-200 hover:bg-red-100 transition-all shadow-sm active:scale-95">Sign Out</button>
        </div>
      </aside>

      <main className={`flex-1 min-w-0 w-full px-3 md:ml-60 md:px-6 lg:px-8 pt-[calc(env(safe-area-inset-top)+5rem)] md:pt-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] min-h-screen relative z-10 transition-all duration-500 ${isGlass ? '!bg-transparent' : ''}`}>
        {isGlass && (
          <>
            {isDark && <div className="fixed inset-0 z-[-1] bg-black/30 transition-opacity duration-700"></div>}
            {!isDark && <div className="fixed inset-0 z-[-1] bg-white/10 transition-opacity duration-700"></div>}
          </>
        )}

        {!tenantId && (
          <div className="max-w-6xl mx-auto bg-amber-50 border-l-4 border-amber-500 p-4 md:p-6 rounded-xl mb-8 flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            <div>
              <h3 className="text-sm font-bold text-amber-900">This account is not in a workspace yet</h3>
              <p className="text-xs text-amber-800 mt-1">Quotes, email and the AI stay empty until someone adds you to one. Ask your workspace admin to invite you under Settings → User Access, or write to support@bloomgard.co.</p>
            </div>
          </div>
        )}

        {currentView === "home" && (
          <AgentHome
            userEmail={user?.email || ''}
            docsLink={<DocsLink view="home" />}
            initialPrompt={pendingAsk}
            onInitialPromptUsed={() => setPendingAsk('')}
            onOpenStudio={() => setCurrentView('studio')}
            onNewQuote={() => {
              setEditingId(null);
              setQn("");
              setDynamicData(blueprint.reduce((acc, s) => ({ ...acc, [s.title]: s.is_log ? [] : s.allow_multiple ? [{}] : {} }), {}));
              setCurrentView('new_entry');
            }}
            onOpenQuote={(qnNumber: string) => {
              const rec = records.find((r: any) => (r.qn_number || r.qn) === qnNumber);
              if (rec) setSelectedRecord(rec); else setCurrentView('pipeline');
            }}
            onNavigate={(v: string) => { if (v.startsWith('settings:')) { setSettingsSubView(v.split(':')[1]); setCurrentView('settings'); } else setCurrentView(v); }}
            onChanged={async (kinds: string[]) => {
              if (tenantId) fetchRecords(tenantId);
              fetchInboxLogs();
              loadTaskCounts(); loadSavedViews();
              if (kinds.includes('form') && tenantId) {
                // the AI changed the quote form: load it again so every screen uses the new modules
                const { data } = await supabase.from('tenant_schemas').select('schema_config').eq('tenant_id', tenantId).maybeSingle();
                const bp = (data?.schema_config || []).filter((x: any) => !x.is_agent_config && !x.is_ai_settings && !x.is_branding);
                setBlueprint(bp); setBlueprintSaved(JSON.stringify(bp));
              }
            }}
          />
        )}

        {currentView === "tasks" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
            <header className="mb-6">
              <div className="flex items-center gap-3 flex-wrap"><h2 className="text-3xl font-bold text-gray-900">OK list</h2><DocsLink view="tasks" /></div>
              <p className="text-sm text-gray-600 mt-1">What waits on a person: changes the AI and your automations prepared, and to-dos the team gave each other.</p>
            </header>
            <TasksView
              isManager={isManager}
              userId={user?.id || ''}
              userEmail={user?.email || ''}
              onOpenQuote={(id) => { const rec = records.find((r: any) => r.id === id); if (rec) setSelectedRecord(rec); }}
              onCountsChange={(c) => { setTaskCounts(c); if (tenantId) fetchRecords(tenantId); }}
            />
          </div>
        )}

        {currentView === "team" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto">
            <header className="mb-6">
              <div className="flex items-center gap-3 flex-wrap"><h2 className="text-3xl font-bold text-gray-900">Team</h2><DocsLink view="team" /></div>
              <p className="text-sm text-gray-600 mt-1">{(isManager ? teamTab : teamTab === 'people' ? 'planning' : teamTab) === 'people' ? 'Who is carrying which quotes, what is waiting on whom, and what moved today.' : (isManager ? teamTab : teamTab === 'people' ? 'planning' : teamTab) === 'chat' ? 'Talk it through: channels for the whole team and direct messages.' : 'Plan the work together: cards for what needs doing, who has it, and by when.'}</p>
            </header>
            <TeamView
              isManager={isManager}
              tab={teamTab}
              onTabChange={setTeamTab}
              focus={teamFocus}
              onFocusUsed={() => setTeamFocus('')}
              onOpenQuote={(id) => { const rec = records.find((r: any) => r.id === id); if (rec) setSelectedRecord(rec); else openQuoteById(id); }}
              onOpenQuoteByQn={(qnNumber) => { const rec = records.find((r: any) => String(r.qn_number || r.qn || '').toLowerCase() === qnNumber.toLowerCase()); if (rec) setSelectedRecord(rec); else alert(`No quote ${qnNumber} in this workspace.`); }}
            />
          </div>
        )}

        {currentView === "studio" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
            <StudioView
              isManager={isManager}
              userEmail={user?.email || ''}
              tab={studioTab}
              onTabChange={setStudioTab}
              onOpenQuote={(id) => { const rec = records.find((r: any) => r.id === id); if (rec) setSelectedRecord(rec); }}
              onAskAI={askAI}
              onChanged={async (kinds) => {
                if (tenantId) fetchRecords(tenantId);
                loadSavedViews();
                if (kinds.includes('form') && tenantId) {
                  const { data } = await supabase.from('tenant_schemas').select('schema_config').eq('tenant_id', tenantId).maybeSingle();
                  const bp = (data?.schema_config || []).filter((x: any) => !x.is_agent_config && !x.is_ai_settings && !x.is_branding);
                  setBlueprint(bp); setBlueprintSaved(JSON.stringify(bp));
                }
              }}
            />
          </div>
        )}

        {currentView === "alerts" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
            <header className="mb-7">
              <div className="flex items-center gap-3 flex-wrap"><h2 className="text-3xl font-bold text-gray-900">Follow ups</h2><DocsLink view="alerts" /></div>
              <p className="text-sm text-gray-600 mt-1">Quotes that have gone quiet, client replies waiting on you, and what has already been sent.</p>
            </header>

            <div className="fu-tabs" role="tablist" aria-label="Follow ups">
              {([
                ['due', 'Due', sortedPendingAlerts.length],
                ['incoming', 'Incoming', visibleEmailThreads.filter(t => t.triage_status === 'incoming').length],
                ['outgoing', 'Outgoing', visibleEmailThreads.filter(t => t.triage_status === 'outgoing').length],
                ['history', 'Done', historyAlerts.length],
              ] as Array<[string, string, number]>).map(([key, label, count]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={triageTab === key}
                  onClick={() => setTriageTab(key)}
                  className={`fu-tab ${triageTab === key ? 'fu-tab--on' : ''}`}
                >
                  {label} <b>{count}</b>
                </button>
              ))}
            </div>

            {triageTab === 'due' && (
              <>
                <div className="fu-bar">
                  <div className="fu-search">
                    <Search aria-hidden />
                    <input
                      type="text"
                      aria-label="Search follow-ups"
                      value={triageSearch}
                      onChange={(e) => setTriageSearch(e.target.value)}
                      placeholder="Search quote #, client…"
                    />
                  </div>
                  <label className="sr-only" htmlFor="fu-days">Quiet for at least</label>
                  <select id="fu-days" className="fu-days" value={triageDaysFilter} onChange={(e) => setTriageDaysFilter(Number(e.target.value))}>
                    <option value={0}>0 Days (Immediate)</option>
                    <option value={1}>1 Day</option>
                    <option value={2}>2 Days</option>
                    <option value={3}>3 Days</option>
                    <option value={5}>5 Days</option>
                    <option value={7}>7 Days</option>
                    <option value={14}>14+ Days</option>
                  </select>
                </div>

                {sortedPendingAlerts.length === 0 ? (
                  <div className="fu-empty">
                    <Sparkles aria-hidden />
                    <p>{triageSearch.trim() ? 'No quote matches that search.' : 'Nothing is going cold.'}</p>
                    <small>
                      {triageSearch.trim()
                        ? `Nothing due matches “${triageSearch.trim()}”. Clear the search to see all ${pendingAlerts.length}.`
                        : `A quote appears here once it has been quiet for ${triageDaysFilter} day${triageDaysFilter === 1 ? '' : 's'}.`}
                    </small>
                  </div>
                ) : (
                  <div className="fu-list">
                    {sortedPendingAlerts.map(r => {
                      const defaultSnippet = `Hi ${extractValue(r, 'contact_person', 'Client Information') || 'there'}, just following up on our recent quote (${r.qn_number || r.qn}). Let me know if you have any questions or need further clarification.`;
                      const currentVal = editedSnippets[r.id] !== undefined ? editedSnippets[r.id] : defaultSnippet;
                      const temp = quoteTemperature(r);
                      const due = r.follow_up_due_date || r.custom_metadata?.follow_up_due_date;

                      return (
                        <div key={r.id} className="fu-row">
                          <div className="fu-row__main">
                            <div className="fu-head">
                              <span className={`fu-temp fu-temp--${temp}`}>{TEMP_META[temp].label}</span>
                              <span className="fu-qn">{r.qn_number || r.qn}</span>
                              <button className="fu-client text-left hover:underline" onClick={() => setSelectedRecord(r)}>{getManifestTitle(r)}</button>
                            </div>
                            <p className="fu-due">{due ? `Due ${new Date(due).toLocaleDateString()}` : 'Overdue'} · last touched {daysSinceContact(r)}</p>
                            <div className="fu-draft">
                              <textarea
                                aria-label={`Follow-up message for ${r.qn_number || r.qn}`}
                                value={currentVal}
                                onChange={(e) => setEditedSnippets({ ...editedSnippets, [r.id]: e.target.value })}
                              />
                              <p><span>Suggested message — edit it before you send</span></p>
                            </div>
                          </div>
                          <div className="fu-row__side">
                            <span className="fu-amount">
                              <span>Amount</span>
                              <b>{getFieldValue(r, { name: 'subtotal' })}</b>
                            </span>
                            <button className="fu-go" onClick={() => handleTriggerAgent(r)} disabled={dispatchingId === r.id}>
                              {dispatchingId === r.id
                                ? <><span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" aria-hidden /> Sending…</>
                                : <><Bot className="w-4 h-4" aria-hidden /> Send follow-up</>}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {triageTab === 'history' && (
              historyAlerts.length === 0 ? (
                <div className="fu-empty">
                  <Scroll aria-hidden />
                  <p>No follow-ups sent yet.</p>
                  <small>Once you send one from the Due tab, the whole exchange is kept here.</small>
                </div>
              ) : (
                <div className="fu-list">
                  {historyAlerts.map(r => {
                    const open = expandedHistoryId === r.id;
                    return (
                      <div key={`hist-${r.id}`} className="fu-thread">
                        <button
                          className="fu-thread__head w-full"
                          aria-expanded={open}
                          onClick={() => setExpandedHistoryId(open ? null : r.id)}
                        >
                          <span className="fu-qn">{r.qn_number || r.qn}</span>
                          <span className="fu-client">{getManifestTitle(r)}</span>
                          <span className="fu-thread__when">{r.follow_up_status || r.custom_metadata?.follow_up_status} · <span className="fu-disclose">{open ? 'Hide' : 'View'}</span></span>
                        </button>

                        {open && (
                          <div onClick={e => e.stopPropagation()}>
                            {r.custom_metadata?.agent_summary && (
                              <p className="fu-summary"><span>What the AI concluded</span>{r.custom_metadata.agent_summary}</p>
                            )}
                            {r.custom_metadata?.agent_conversations?.length > 0 && (
                              <div className="fu-convo">
                                {r.custom_metadata.agent_conversations.map((msg: any, idx: number) => (
                                  <div key={idx} className={`fu-msg fu-msg--${msg.role === 'client' ? 'client' : 'agent'}`}>
                                    <em>{msg.role === 'client' ? 'Client' : 'You'} · {new Date(msg.timestamp).toLocaleString()}</em>
                                    <div>{msg.content}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="fu-reply">
                              <textarea
                                aria-label={`Reply to the client on ${r.qn_number || r.qn}`}
                                value={quoteReplyTexts[r.id] || ''}
                                onChange={(e) => setQuoteReplyTexts(prev => ({ ...prev, [r.id]: e.target.value }))}
                                placeholder="Type a reply to the client…"
                              />
                              <div className="fu-reply__foot">
                                <button
                                  className="fu-go"
                                  onClick={() => handleQuoteReply(r)}
                                  disabled={isSendingQuoteReply === r.id || !(quoteReplyTexts[r.id] || '').trim()}
                                >
                                  {isSendingQuoteReply === r.id ? 'Sending…' : 'Send Reply'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {(triageTab === 'incoming' || triageTab === 'outgoing') && (() => {
              const tabThreads = visibleEmailThreads.filter(t => t.triage_status === triageTab);
              if (tabThreads.length === 0) {
                return (
                  <div className="fu-empty">
                    <Inbox aria-hidden />
                    <p>{triageTab === 'incoming' ? 'No client replies waiting.' : 'Nothing sent is still waiting on a client.'}</p>
                    <small>{triageTab === 'incoming' ? 'A reply to a quote lands here with a draft answer ready.' : 'Follow-ups you send move here until the client writes back.'}</small>
                  </div>
                );
              }
              return (
                <div className="fu-list">
                  {tabThreads.map((thread) => {
                    const q = thread.quotations || {};
                    let meta = q.custom_metadata;
                    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
                    const replyText = quoteReplyTexts[thread.id] !== undefined ? quoteReplyTexts[thread.id] : (thread.ai_draft_text || '');

                    return (
                      <div key={thread.id} className="fu-thread">
                        <div className="fu-thread__head">
                          <span className="fu-qn">{q.qn_number}</span>
                          <span className="fu-client">{q.clients?.company_name || meta?.client_name || 'Client'}</span>
                          <span className="fu-thread__when">{new Date(thread.last_updated).toLocaleString()}</span>
                        </div>

                        {meta?.agent_summary && (
                          <p className="fu-summary"><span>What the AI concluded</span>{meta.agent_summary}</p>
                        )}

                        {meta?.agent_conversations?.length > 0 ? (
                          <div className="fu-convo">
                            {meta.agent_conversations.map((msg: any, idx: number) => (
                              <div key={idx} className={`fu-msg fu-msg--${msg.role === 'client' ? 'client' : 'agent'}`}>
                                <em>{msg.role === 'client' ? 'Client' : 'You'} · {new Date(msg.timestamp).toLocaleString()}</em>
                                <div>{msg.content}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">No messages on this thread yet.</p>
                        )}

                        {triageTab === 'incoming' && (
                          <div className="fu-reply">
                            <span><Sparkles aria-hidden /> AI suggested reply</span>
                            <textarea
                              aria-label={`Reply to the client on ${q.qn_number}`}
                              value={replyText}
                              onChange={(e) => setQuoteReplyTexts(prev => ({ ...prev, [thread.id]: e.target.value }))}
                              placeholder="Type a manual reply to the client..."
                            />
                            <div className="fu-reply__foot">
                              <button
                                className="fu-go"
                                disabled={isSendingQuoteReply === thread.id || !replyText.trim()}
                                onClick={async () => {
                                  if (!replyText.trim()) return;
                                  setIsSendingQuoteReply(thread.id);
                                  try {
                                    const res = await fetch('/api/agent/reply', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ threadId: thread.id, quoteId: q.id, tenantId: q.tenant_id, agentId: thread.agent_id, message: replyText }),
                                    });
                                    const data = await res.json();
                                    if (data.success) {
                                      alert("Reply sent successfully!");
                                      setQuoteReplyTexts(prev => ({ ...prev, [thread.id]: '' }));
                                      await fetchRecords(tenantId);
                                    } else {
                                      alert("Failed: " + data.error);
                                    }
                                  } catch (e) {
                                    alert("Error: " + e.message);
                                  } finally {
                                    setIsSendingQuoteReply(false);
                                  }
                                }}
                              >
                                {isSendingQuoteReply === thread.id ? 'Sending…' : 'Send Reply'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {currentView === "settings" && (
          <div className="settings-page animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto space-y-5">
            <header className="mb-1 flex flex-col items-start gap-2">
              {settingsSubView !== 'menu' && (
                <button onClick={() => setSettingsSubView('menu')} className="text-gray-500 hover:text-gray-900 text-sm font-semibold">
                  ← Back to Menu
                </button>
              )}
              <div className="flex items-center gap-3 flex-wrap"><h2 className="text-3xl font-bold text-gray-900">{({ profile: "Your Profile", "master-data": "Master Data", users: "User Access", blueprint: "Field Configurator", email: "Email Settings", personalization: "Personalization", "ai-personality": "AI Settings", "quote-template": "Quote Template", automations: "Automations", plugins: "Plugins", data: "Import & export" } as Record<string, string>)[settingsSubView] || "Workspace Settings"}</h2><DocsLink view="settings" sub={settingsSubView} /></div>
            </header>

            {settingsSubView === 'menu' && (
              <nav className="set-list mb-8" aria-label="Settings">
                {[
                  { key: 'profile', icon: ClipboardList, title: 'Your Profile', desc: 'Your name, title and contact details, used by the AI to sign emails as you.', managerOnly: false },
                  { key: 'master-data', icon: Database, title: 'Master Data', desc: 'Your product catalogue: linked columns, Excel import and the values the AI quotes from.', managerOnly: true },
                  { key: 'users', icon: Users, title: 'User Access', desc: 'Add agents, managers and admins, and reset their passwords.', managerOnly: true },
                  { key: 'blueprint', icon: Wrench, title: 'Field Configurator', desc: 'Design the quote form: modules, fields and log modules.', managerOnly: true },
                  { key: 'email', icon: Mail, title: 'Email Settings', desc: 'Connect your company domain and set where client replies arrive.', managerOnly: false },
                  { key: 'personalization', icon: Sparkles, title: 'Personalization', desc: 'Switch between the light and dark Jaali themes.', managerOnly: false },
                  { key: 'ai-personality', icon: Bot, title: 'AI Settings', desc: 'Tone, English level, instructions and email routing rules.', managerOnly: true },
                  { key: 'quote-template', icon: Palette, title: 'Quote Template', desc: 'Brand identity and the HTML your quote PDFs are built from.', managerOnly: true },
                  { key: 'automations', icon: Workflow, title: 'Automations', desc: 'Rules that chase quiet quotes, hand out tasks and keep the team informed. They live in Studio, with everything else the AI builds.', managerOnly: false },
                  { key: 'plugins', icon: Plug, title: 'Plugins', desc: 'Webhook, Slack, an inbound API for your website form, and an accounting export.', managerOnly: false },
                  { key: 'data', icon: ArrowDownUp, title: 'Import & export', desc: 'Download your quotes as a spreadsheet (CSV) or a full backup (JSON), and bring quotes in from a backup.', managerOnly: false },
                ].filter(item => !item.managerOnly || isManager).map(item => {
                  const Icon = item.icon;
                  return (
                    <button key={item.key} onClick={() => { if (item.key === 'automations') { setStudioTab('automations'); setCurrentView('studio'); } else setSettingsSubView(item.key); }} className="set-row">
                      <Icon className="set-row__icon" aria-hidden />
                      <span className="set-row__text">
                        <span className="set-row__title">{item.title}</span>
                        <span className="set-row__desc">{item.desc}</span>
                      </span>
                      <ChevronRight className="set-row__go" aria-hidden />
                    </button>
                  );
                })}
                <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className="set-row">
                  <BookOpen className="set-row__icon" aria-hidden />
                  <span className="set-row__text">
                    <span className="set-row__title">Docs</span>
                    <span className="set-row__desc">Guides for every feature, setup steps and troubleshooting at docs.bloomgard.co.</span>
                  </span>
                  <ExternalLink className="set-row__go" aria-hidden />
                </a>
              </nav>
            )}

            {settingsSubView === 'master-data' && tenantId && (
              <MasterDataUI tenantId={tenantId} schemaFields={blueprint.flatMap(section => section.fields.map(f => f.name))} />
            )}

            {settingsSubView === 'users' && (
              <div className="space-y-6" data-testid="user-access">
                <section className="ed-card">
                  <h3 className="text-base font-semibold text-gray-900">Add someone</h3>
                  <p className="text-xs text-gray-500">They sign in with this email. Leave the password empty and a strong one is generated; it is shown once, here.</p>
                  <div className="grid grid-cols-1 md:grid-cols-[2fr_1.5fr_1fr_1.5fr_auto] gap-3 mt-4 items-end">
                    <label className="ua-field"><span>Email</span><input type="email" value={onboardEmail} onChange={e => setOnboardEmail(e.target.value)} autoComplete="off" /></label>
                    <label className="ua-field"><span>Name</span><input value={onboardName} onChange={e => setOnboardName(e.target.value)} autoComplete="off" /></label>
                    <label className="ua-field"><span>Role</span>
                      <select value={onboardRole} onChange={e => setOnboardRole(e.target.value)}>
                        <option value="agent">Agent</option>
                        <option value="manager">Manager</option>
                        {user?.role?.toLowerCase() === 'admin' && <option value="admin">Admin</option>}
                      </select>
                    </label>
                    <label className="ua-field"><span>Password <em>(optional)</em></span><input type="text" value={onboardPassword} onChange={e => setOnboardPassword(e.target.value)} autoComplete="new-password" /></label>
                    <button onClick={handleCreateUser} className="agent-btn agent-btn--primary h-[38px]">Add user</button>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2"><b>Agent</b>: own quotes. <b>Manager</b>: every quote, catalogue, users, AI settings. <b>Admin</b>: everything, including other admins.</p>
                  {userSecret && (
                    <div className="agent-secret">
                      <span className="agent-label">{userSecret.kind === 'new' ? 'New user' : 'New password'}</span>
                      <span className="text-sm">{userSecret.email}</span>
                      <code>{userSecret.password}</code>
                      <button type="button" className="agent-btn" onClick={() => { navigator.clipboard.writeText(`${userSecret.email} / ${userSecret.password}`); }}>Copy</button>
                      <span className="text-[11px] text-gray-500">Shown once. Share it privately.</span>
                      <button type="button" className="fc-icon ml-auto" aria-label="Hide" onClick={() => setUserSecret(null)}><X className="w-4 h-4" /></button>
                    </div>
                  )}
                </section>

                <section>
                  <div className="flex items-baseline gap-3 mb-2"><h3 className="text-base font-semibold text-gray-900">People</h3><span className="agent-label">{tenantUsers.length}</span></div>
                  <div className="overflow-x-auto">
                    <table className="ed-table ua-table">
                      <thead><tr><th>Person</th><th>Role</th><th>Forwarding address</th><th /></tr></thead>
                      <tbody>
                        {tenantUsers.map(u => (
                          <tr key={u.id}>
                            <td><div className="font-medium text-gray-900">{u.full_name || u.email}</div>{u.full_name && <div className="text-[11px] text-gray-500">{u.email}</div>}</td>
                            <td>
                              {u.id === user?.id ? <span className="ed-type">{u.role}</span> : (
                                <select value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)} className="ed-input !py-1 text-xs" aria-label={`Role for ${u.email}`}>
                                  <option value="agent">agent</option><option value="manager">manager</option>
                                  {(user?.role?.toLowerCase() === 'admin' || u.role === 'admin') && <option value="admin">admin</option>}
                                </select>
                              )}
                            </td>
                            <td>{u.inbound_email ? <code className="text-[11px]">{u.inbound_email}</code> : <span className="text-[11px] text-gray-400">uses the workspace address</span>}</td>
                            <td className="text-right whitespace-nowrap">
                              {u.id !== user?.id && <button onClick={() => handleResetPassword(u.id)} className="agent-btn mr-2">Reset password</button>}
                              {u.id !== user?.id && <button onClick={async () => {
                                if (confirm(`Remove ${u.email} from this workspace?`)) {
                                  await supabase.rpc('decommission_employee', { target_email: u.email });
                                  reloadUsers();
                                }
                              }} className="agent-btn">Remove</button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {settingsSubView === 'blueprint' && (
              <FieldConfigurator
                blueprint={blueprint}
                setBlueprint={setBlueprint}
                onSave={handleSaveBlueprint}
                saving={blueprintSaving}
                dirty={JSON.stringify(blueprint) !== blueprintSaved}
                statuses={allStatuses}
                builtins={[statusLogSection]}
              />
            )}

            {settingsSubView === 'profile' && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm max-w-2xl">
                <div className="set-head flex items-center gap-3 mb-8 pb-4 border-b border-gray-100">
                  <ClipboardList className="w-6 h-6" />
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Your Profile</h3>
                    <p className="text-xs text-gray-500 mt-1">This identity is what the AI signs emails as on your behalf — no more "[Your Name]" placeholders.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Full Name</label>
                      <input
                        type="text"
                        value={profileForm.full_name} aria-label="Full name"
                        onChange={e => setProfileForm({ ...profileForm, full_name: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl text-sm font-medium outline-none focus:border-indigo-400"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Job Title</label>
                      <input
                        type="text"
                        value={profileForm.job_title} aria-label="Job title"
                        onChange={e => setProfileForm({ ...profileForm, job_title: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl text-sm font-medium outline-none focus:border-indigo-400"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Phone</label>
                      <input
                        type="text"
                        value={profileForm.phone} aria-label="Phone"
                        onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl text-sm font-medium outline-none focus:border-indigo-400"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Company Name</label>
                      <input type="text" readOnly value={companyName || ''} aria-label="Company name" className="w-full bg-gray-100 border border-gray-200 px-4 py-3 rounded-xl text-sm font-medium outline-none cursor-not-allowed text-gray-500" />
                      <p className="text-[10px] text-gray-400 ml-1">Set by your workspace admin.</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Email Sign-Off (optional)</label>
                    <p className="text-xs text-gray-500 mb-1">Overrides the default Name / Title / Company sign-off with your own exact wording. Leave blank to use the fields above.</p>
                    <textarea
                      value={profileForm.signature} aria-label="Email sign-off"
                      onChange={e => setProfileForm({ ...profileForm, signature: e.target.value })}
                      rows={4}
                      className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 resize-y"
                    />
                  </div>

                  <div>
                    <button
                      onClick={handleSaveProfile}
                      disabled={isSavingProfile}
                      className="agent-btn agent-btn--primary"
                    >
                      {isSavingProfile ? "Saving..." : "Save Profile"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {settingsSubView === 'email' && <EmailDomainSetup />}
            {settingsSubView === 'email' && (
              <section className="ed-card" data-testid="personal-routing">
                <div className="flex items-center gap-3">
                  <CornerUpLeft className="w-5 h-5 text-[var(--neelam)]" />
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">A second address, just for you (optional)</h3>
                    <p className="text-xs text-gray-500">
                      The workspace address above is shared: everything sent to it lands in the Inbox unassigned, for whoever picks it up first.
                      A personal address works exactly the same way, except mail sent to it is assigned to you automatically — handy when several
                      people forward their own client mail into the same workspace.
                    </p>
                  </div>
                </div>

                {!userRoutingSlug && !personalRoutingOpen ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <p className="text-xs text-gray-600">
                      You're on the shared address{workspaceInbound && <> <code className="text-[11px]">{workspaceInbound}</code></>}. Nothing to do here unless you want your mail assigned to you.
                    </p>
                    <button
                      onClick={() => {
                        setUserRoutingSlug(String(user?.email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '') || '');
                        setPersonalRoutingOpen(true);
                      }}
                      className="agent-btn h-[38px]"
                    >Give me my own address</button>
                  </div>
                ) : (
                  <>
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <label className="ua-field" style={{ flex: '1 1 20rem' }}>
                        <span>Your address</span>
                        <span className="ed-input flex items-center !py-0">
                          <input type="text" value={userRoutingSlug} aria-label="Your forwarding address"
                            onChange={e => setUserRoutingSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                            className="flex-1 min-w-0 py-2 bg-transparent outline-none font-mono text-[var(--neelam)]" />
                          <span className="text-sm text-gray-500 font-mono shrink-0">@inbound.bloomgard.co</span>
                        </span>
                      </label>
                      <button
                        onClick={async () => {
                          if (!user?.id) return;
                          setIsSavingSettings(true);
                          // an empty box means "use the workspace address", never "@inbound.bloomgard.co"
                          const slug = String(userRoutingSlug || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
                          const newInbound = slug ? `${slug}@inbound.bloomgard.co` : null;
                          const { error } = await supabase.from('profiles').update({ inbound_email: newInbound }).eq('id', user.id);
                          setIsSavingSettings(false);
                          if (error) alert("Failed to save: " + error.message);
                          else {
                            setUser({ ...user, inbound_email: newInbound });
                            setPersonalRoutingOpen(false);
                            alert(newInbound ? `Mail sent to ${newInbound} will now be assigned to you.` : "You're back on the shared workspace address.");
                          }
                        }}
                        disabled={isSavingSettings || !userRoutingSlug}
                        className="agent-btn agent-btn--primary h-[38px]"
                      >
                        {isSavingSettings ? "Saving…" : "Save my address"}
                      </button>
                      {userRoutingSlug && (
                        <button onClick={() => { navigator.clipboard.writeText(`${userRoutingSlug}@inbound.bloomgard.co`); alert("Copied!"); }} className="agent-btn h-[38px]">Copy</button>
                      )}
                      <button
                        onClick={async () => {
                          if (!user?.inbound_email) { setUserRoutingSlug(""); setPersonalRoutingOpen(false); return; }
                          if (!confirm(`Remove ${user.inbound_email}? Your mail goes back to the shared workspace address and arrives unassigned.`)) return;
                          setIsSavingSettings(true);
                          const { error } = await supabase.from('profiles').update({ inbound_email: null }).eq('id', user.id);
                          setIsSavingSettings(false);
                          if (error) alert("Failed to save: " + error.message);
                          else { setUser({ ...user, inbound_email: null }); setUserRoutingSlug(""); setPersonalRoutingOpen(false); }
                        }}
                        disabled={isSavingSettings}
                        className="agent-btn h-[38px]"
                      >{user?.inbound_email ? "Remove" : "Cancel"}</button>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-3">
                      You sign in as <b>{user?.email}</b>. Forward client mail here from your own inbox the same way as above — the only difference is who it gets assigned to.
                    </p>
                  </>
                )}
              </section>
            )}

            {settingsSubView === 'plugins' && <PluginsView isManager={isManager} />}

            {settingsSubView === 'data' && (
              <div className="grid gap-5 max-w-3xl">
                <section className="border border-gray-200 rounded-2xl p-6 bg-white">
                  <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Download className="w-4 h-4" aria-hidden /> Export quotes</h3>
                  <p className="text-sm text-gray-600 mt-1">Every quote you can see ({visibleRecords.length}). The spreadsheet has a column for every field of your quote form; the backup keeps everything, line items and logs included, and can be imported again.</p>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button type="button" onClick={() => handleExportData('csv')} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm active:scale-95 transition-transform">Download spreadsheet (CSV)</button>
                    <button type="button" onClick={() => handleExportData('json')} className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm active:scale-95 transition-transform">Download backup (JSON)</button>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">Want only some quotes, or particular columns? Ask Bloomgard AI on Home, for example “export my approved quotes from this month as Excel”.</p>
                </section>
                <section className="border border-gray-200 rounded-2xl p-6 bg-white">
                  <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Upload className="w-4 h-4" aria-hidden /> Import quotes</h3>
                  <p className="text-sm text-gray-600 mt-1">Bring quotes in from a Bloomgard backup (.json). Each one is added as a new quote owned by you; nothing already here is changed.</p>
                  <input type="file" accept=".json,application/json" className="hidden" ref={fileInputRef} onChange={handleImportData} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-4 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm active:scale-95 transition-transform">Choose a backup file…</button>
                </section>
              </div>
            )}

            {settingsSubView === 'personalization' && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm max-w-2xl">
                <div className="set-head flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                  <Sparkles className="w-6 h-6" />
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">UI & Personalization</h3>
                  </div>
                </div>

                <div className="space-y-6 mb-12">
                  <div className="grid grid-cols-1 gap-6">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Theme Mode</label>
                      <div className="flex bg-gray-100/50 p-1 rounded-xl w-full border border-gray-200/50">
                        <button onClick={() => setUserPreferences({ ...userPreferences, theme: 'light' })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${userPreferences.theme === 'light' ? 'bg-white shadow-sm text-gray-900 border border-gray-200/50' : 'text-gray-500 hover:text-gray-700'}`}>Light Mode</button>
                        <button onClick={() => setUserPreferences({ ...userPreferences, theme: 'dark' })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${userPreferences.theme === 'dark' ? 'bg-gray-900 shadow-sm text-white' : 'text-gray-500 hover:text-gray-700'}`}>Dark Mode</button>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setIsSavingPrefs(true);
                      localStorage.setItem('userPrefs_' + user?.id, JSON.stringify(userPreferences));
                      if (user?.id) {
                        await supabase.from('profiles').update({ custom_metadata: { ...user.custom_metadata, preferences: userPreferences } }).eq('id', user.id);
                      }
                      setIsSavingPrefs(false);
                      alert("Personalization settings saved successfully!");
                    }}
                    disabled={isSavingPrefs}
                    className="agent-btn agent-btn--primary"
                  >
                    {isSavingPrefs ? "Saving..." : "Save UI Preferences"}
                  </button>
                </div>
              </div>
            )}

            {settingsSubView === 'ai-personality' && isManager && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm max-w-3xl">
                <div className="set-head flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                  <Bot className="w-6 h-6" />
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">AI Settings</h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Tone</label>
                    <select value={aiSettings.tone} onChange={e => setAiSettings({ ...aiSettings, tone: e.target.value })} className="w-full bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 mt-1 cursor-pointer">
                      <option>Professional</option>
                      <option>Casual</option>
                      <option>Friendly</option>
                      <option>Aggressive</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">English Level</label>
                    <select value={aiSettings.englishLevel} onChange={e => setAiSettings({ ...aiSettings, englishLevel: e.target.value })} className="w-full bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 mt-1 cursor-pointer">
                      <option>Native</option>
                      <option>Simple / Basic</option>
                      <option>Corporate Jargon</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Desperation Level</label>
                    <select value={aiSettings.desperation} onChange={e => setAiSettings({ ...aiSettings, desperation: e.target.value })} className="w-full bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 mt-1 cursor-pointer">
                      <option>Low (Confident)</option>
                      <option>Medium (Eager)</option>
                      <option>High (Need the deal)</option>
                    </select>
                  </div>
                </div>

                <div className="mb-8">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">System Instructions</label>
                  <textarea
                    value={aiSettings.instructions || ''} aria-label="System instructions"
                    onChange={e => setAiSettings({ ...aiSettings, instructions: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-400 min-h-[100px] resize-y"
                  />
                </div>

                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Email Routing Rules</label>
                    <button
                      onClick={() => setAiSettings({ ...aiSettings, emailRouting: [...(aiSettings.emailRouting || []), { lookFor: '', routeTo: '', sendRouteMessage: false, routeMessage: '' }] })}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-lg hover:bg-indigo-100 transition-colors uppercase tracking-wider"
                    >
                      + Add Rule
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {(aiSettings.emailRouting || []).map((rule, idx) => (
                      <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl p-4 relative">
                        <button
                          onClick={() => setAiSettings({ ...aiSettings, emailRouting: aiSettings.emailRouting.filter((_, i) => i !== idx) })}
                          className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pr-8">
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1 block mb-1">Condition (Look For)</label>
                            <input
                              type="text"
                              value={rule.lookFor} aria-label="Condition"
                              onChange={e => {
                                const newRouting = [...aiSettings.emailRouting];
                                newRouting[idx].lookFor = e.target.value;
                                setAiSettings({ ...aiSettings, emailRouting: newRouting });
                              }}
                              className="w-full bg-white border border-gray-200 px-3 py-2 rounded-lg text-sm outline-none focus:border-indigo-400"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1 block mb-1">Route To (Email ID)</label>
                            <input
                              type="email"
                              value={rule.routeTo} aria-label="Route to"
                              onChange={e => {
                                const newRouting = [...aiSettings.emailRouting];
                                newRouting[idx].routeTo = e.target.value;
                                setAiSettings({ ...aiSettings, emailRouting: newRouting });
                              }}
                              className="w-full bg-white border border-gray-200 px-3 py-2 rounded-lg text-sm outline-none focus:border-indigo-400"
                            />
                          </div>
                        </div>

                        <div className="mb-2 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={rule.sendRouteMessage}
                            onChange={e => {
                              const newRouting = [...aiSettings.emailRouting];
                              newRouting[idx].sendRouteMessage = e.target.checked;
                              setAiSettings({ ...aiSettings, emailRouting: newRouting });
                            }}
                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                          />
                          <label className="text-xs font-semibold text-gray-700">Send custom message with routed email?</label>
                        </div>

                        {rule.sendRouteMessage && (
                          <div>
                            <textarea
                              value={rule.routeMessage} aria-label="Message to prepend"
                              onChange={e => {
                                const newRouting = [...aiSettings.emailRouting];
                                newRouting[idx].routeMessage = e.target.value;
                                setAiSettings({ ...aiSettings, emailRouting: newRouting });
                              }}
                              className="w-full bg-white border border-gray-200 px-3 py-2 rounded-lg text-sm outline-none focus:border-indigo-400 min-h-[60px]"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                    {(aiSettings.emailRouting || []).length === 0 && (
                      <div className="text-center py-6 text-sm text-gray-500 bg-gray-50 border border-gray-200 border-dashed rounded-xl">
                        No email routing rules configured.
                      </div>
                    )}
                  </div>
                </div>
                <button
                    onClick={async () => {
                      if (!tenantId) return;
                      setIsSavingSettings(true);

                      const newSchemaConfig = [
                        ...blueprint,
                        { is_agent_config: true, agents, title: "system_agents" },
                        { ...aiSettings, is_ai_settings: true, title: "ai_settings" },
                        { is_branding: true, logo_url: logoUrl, title: "branding_settings" }
                      ];

                      const { error } = await supabase.from('tenant_schemas').update({ schema_config: newSchemaConfig }).eq('tenant_id', tenantId);

                      setIsSavingSettings(false);
                      if (error) alert("Failed to save: " + error.message);
                      else alert("AI Settings saved successfully!");
                    }}
                    disabled={isSavingSettings}
                    className="agent-btn agent-btn--primary"
                  >
                    {isSavingSettings ? "Saving..." : "Save AI Settings"}
                  </button>
              </div>
            )}

            {settingsSubView === 'quote-template' && isManager && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm">
                {/* BRANDING / LOGO CONFIGURATION */}
                <div className="set-head flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                  <Palette className="w-6 h-6" />
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Brand Identity</h3>
                  </div>
                </div>
                <div className="space-y-4 max-w-md mb-10">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Company Logo URL</label>
                    <input
                      type="url"
                      value={logoUrl} aria-label="Company logo URL"
                      onChange={e => setLogoUrl(e.target.value)}
                      className="w-full bg-gray-50 hover:bg-white focus:bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 transition-colors"
                    />
                    <p className="text-[10px] text-gray-400 mt-1 ml-1 leading-relaxed">
                      Accessible in the template as <code className="bg-gray-100 px-1 py-0.5 rounded text-indigo-500">{"{{company_logo}}"}</code>
                    </p>
                  </div>
                </div>

                {/* STARTER TEMPLATES — a choice, never applied on their own */}
                <div className="mb-8" data-testid="template-gallery">
                  <h3 className="text-base font-semibold text-gray-900">Start from a template</h3>
                  <p className="text-xs text-gray-500 mt-1">Optional. Picking one loads it into the editor below, where you can change it; nothing is saved until you press Save Template &amp; Logo. Your current template stays untouched until then.</p>
                  <div className="tpl-grid mt-4">
                    {QUOTE_TEMPLATES.map(t => (
                      <div key={t.id} className="tpl">
                        <div className="tpl__thumb" aria-hidden><iframe title="" srcDoc={t.html} scrolling="no" /></div>
                        <div className="tpl__body">
                          <h4>{t.name}</h4>
                          <p>{t.blurb}</p>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => {
                                const hasWork = (htmlTemplate || '').trim().length > 0 && htmlTemplate !== templateBefore;
                                if (hasWork && !confirm(`Replace what is in the editor with the "${t.name}" template? Your saved template is not changed until you save.`)) return;
                                if (templateBefore === null) setTemplateBefore(htmlTemplate || '');
                                setHtmlTemplate(t.html);
                              }}
                              className="agent-btn"
                            >Use this</button>
                            <button onClick={() => setPreviewTemplate(t)} className="agent-btn">Preview</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {templateBefore !== null && (
                    <p className="text-xs text-gray-600 mt-3">
                      A starter template is loaded in the editor.{' '}
                      <button onClick={() => { setHtmlTemplate(templateBefore); setTemplateBefore(null); }} className="font-semibold text-[var(--neelam)] hover:underline">Put my own template back</button>
                    </p>
                  )}
                </div>

                {/* HTML TEMPLATE EDITOR */}
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                  <div className="flex items-center gap-3">
                    <ClipboardList className="w-6 h-6" />
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Quotation Template Editor</h3>
                      <p className="text-[10px] uppercase tracking-widest text-gray-400 mt-1">Live Document Engine</p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!tenantId) return;
                      setIsSavingSettings(true);

                      const newSchemaConfig = [
                        ...blueprint,
                        { is_agent_config: true, agents, title: "system_agents" },
                        { ...aiSettings, is_ai_settings: true, title: "ai_settings" },
                        { is_branding: true, logo_url: logoUrl, title: "branding_settings" }
                      ];

                      const { error } = await supabase.from('tenant_schemas').update({ schema_config: newSchemaConfig, html_template: htmlTemplate }).eq('tenant_id', tenantId);

                      setIsSavingSettings(false);
                      if (error) alert("Failed to save: " + error.message);
                      else alert("Template and Logo saved successfully!");
                    }}
                    disabled={isSavingSettings}
                    className="agent-btn agent-btn--primary"
                  >
                    {isSavingSettings ? "Saving..." : "Save Template & Logo"}
                  </button>
                </div>
                <div className="flex flex-col lg:flex-row gap-6 h-[800px] mb-12">
                  <div className="flex-1 bg-gray-900 rounded-3xl overflow-hidden flex flex-col shadow-inner">
                    <div className="bg-gray-950 px-6 py-4 border-b border-gray-800 flex justify-between items-center"><span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Source Code</span><span className="text-[10px] font-black text-indigo-400">{'{{db_key}}'} Supported</span></div>
                    <textarea className="w-full flex-1 bg-transparent text-gray-300 font-mono text-[11px] p-6 outline-none resize-none leading-relaxed" value={htmlTemplate} onChange={e => setHtmlTemplate(e.target.value)} spellCheck={false} placeholder="Paste pure HTML here..." />
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-3xl border-4 border-dashed border-gray-200 flex flex-col items-center p-8 overflow-y-auto">
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-6">A4 Live Preview</span>
                    {htmlTemplate ? (
                      <div className="shadow-2xl bg-white shrink-0 overflow-hidden origin-top" style={{ width: '794px', height: '1123px', transform: 'scale(0.7)', marginBottom: '-300px' }}><iframe srcDoc={htmlTemplate.replace(/\\{\\{\\{?company_logo\\}\\}?\\}?/g, logoUrl)} className="w-full h-full border-none pointer-events-none" title="Live Preview" /></div>
                    ) : (<div className="flex flex-col items-center justify-center text-gray-400 mt-40"><Monitor className="w-12 h-12 mb-4" /><p className="font-bold uppercase tracking-widest text-xs text-center max-w-xs">Write or paste your code on the left to see the live rendering here.</p></div>)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentView === "agents" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto space-y-8">
            <header className="mb-8 flex justify-between items-end border-b border-gray-200 pb-8">
              <div>
                <div className="flex items-center gap-3 flex-wrap"><h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3"><Bot className="w-8 h-8" /> Agent Fleet</h2><DocsLink view="agents" /></div>
                <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-widest mt-1">Manage Autonomous Follow-up Agents</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleRunCoordinator} disabled={isRunningCoordinator || agents.length === 0} className="bg-white text-gray-900 border border-gray-200 px-6 py-2.5 rounded-xl text-xs font-bold shadow-sm hover:bg-gray-50 active:scale-95 transition-transform disabled:opacity-50">
                  {isRunningCoordinator ? "Syncing..." : "▶ Run Daily Sync"}
                </button>
                <button onClick={() => setEditingAgent({ name: '', email: customSender || '', importance: 5, frequency: 'Immediate', auto_send: true, task: '', instructions: '' })} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-sm hover:bg-indigo-700 active:scale-95 transition-transform">
                  + Create Agent
                </button>
              </div>
            </header>

            {editingAgent ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm max-w-2xl mx-auto">
                <h3 className="text-lg font-bold text-gray-900 mb-6">{editingAgent.id ? "Edit Agent Profile" : "New Agent Profile"}</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Agent Name</label>
                      <input type="text" value={editingAgent.name} onChange={e => setEditingAgent({ ...editingAgent, name: e.target.value })} className="w-full bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-xl text-sm outline-none focus:border-indigo-400" placeholder="e.g. Sarah from Sales" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Agent Email</label>
                      <div className="w-full bg-gray-100/80 border border-gray-200 px-4 py-2.5 rounded-xl text-sm text-gray-500 flex items-center justify-between cursor-not-allowed">
                        <span className="truncate">{customSender || "Configure in Workspace Settings"}</span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded shadow-sm">Global</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Importance Level</label>
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded shadow-sm">{editingAgent.importance || 5}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={editingAgent.importance || 5}
                      onChange={e => setEditingAgent({ ...editingAgent, importance: parseInt(e.target.value) })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[9px] font-bold text-gray-400 mt-2 px-1">
                      <span>Low Priority</span>
                      <span>Critical</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Follow-up Frequency</label>
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded shadow-sm">
                          {editingAgent.frequency === 0 || editingAgent.frequency === 'Immediate' ? 'Immediate' : `${editingAgent.frequency} Days`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="14"
                        value={typeof editingAgent.frequency === 'number' ? editingAgent.frequency : (editingAgent.frequency === 'Immediate' ? 0 : (editingAgent.frequency === 'Daily' ? 1 : (editingAgent.frequency === '3 Days' ? 3 : (editingAgent.frequency === 'Weekly' ? 7 : 0))))}
                        onChange={e => setEditingAgent({ ...editingAgent, frequency: parseInt(e.target.value) })}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <div className="flex justify-between text-[9px] font-bold text-gray-400 mt-2 px-1">
                        <span>Immediate</span>
                        <span>14 Days</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Action Control</label>
                      <div className="flex p-1 bg-gray-100 rounded-xl border border-gray-200">
                        <button
                          type="button"
                          onClick={() => setEditingAgent({ ...editingAgent, auto_send: true })}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${editingAgent.auto_send !== false ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Auto-Send
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingAgent({ ...editingAgent, auto_send: false })}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${editingAgent.auto_send === false ? 'bg-white text-amber-600 shadow-sm border border-amber-100' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Manual Review
                        </button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Specific Task</label>
                    <input type="text" value={editingAgent.task} onChange={e => setEditingAgent({ ...editingAgent, task: e.target.value })} className="w-full bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-xl text-sm outline-none focus:border-indigo-400" placeholder="e.g. Negotiate a 10% discount to close the deal" />
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button type="button" onClick={() => setEditingAgent({ ...editingAgent, task: 'Follow up on the quote and ask if they have any questions' })} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold hover:bg-indigo-100 transition-colors">Follow Up</button>
                      <button type="button" onClick={() => setEditingAgent({ ...editingAgent, task: 'Negotiate a deal within a 10% discount margin' })} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold hover:bg-indigo-100 transition-colors">Negotiate Deal</button>
                      <button type="button" onClick={() => setEditingAgent({ ...editingAgent, task: 'Act as a chatbot and answer their questions about the product' })} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold hover:bg-indigo-100 transition-colors">Answer Questions</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Core Instructions (Product, Policy, Tone)</label>
                    <textarea value={editingAgent.instructions} onChange={e => setEditingAgent({ ...editingAgent, instructions: e.target.value })} className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-400 h-32 resize-none" placeholder="Enter specific instructions regarding products, company policies, and negotiation tactics..."></textarea>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Assign Quotes to Agent</label>
                    <input
                      type="text"
                      value={agentQuoteSearch}
                      onChange={e => setAgentQuoteSearch(e.target.value)}
                      className="w-full mb-3 bg-white border border-gray-200 px-4 py-2 rounded-xl text-xs outline-none focus:border-indigo-400 shadow-sm"
                      placeholder="Search by QN Number or Client Name..."
                    />
                    <div className="w-full bg-gray-50 border border-gray-200 rounded-xl max-h-48 overflow-y-auto p-2 space-y-1">
                      {records.filter(r => {
                        const qnStr = (r.qn_number || r.qn || r.id || "").toLowerCase();
                        const clientStr = (r.clients?.company_name || r.custom_metadata?.client_name || 'Client').toLowerCase();
                        const searchStr = agentQuoteSearch.toLowerCase();
                        return qnStr.includes(searchStr) || clientStr.includes(searchStr);
                      }).map(r => (
                        <label key={r.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors border border-transparent hover:border-gray-200">
                          <input
                            type="checkbox"
                            checked={(editingAgent.assigned_quote_ids || []).includes(r.id)}
                            onChange={(e) => {
                              const currentIds = editingAgent.assigned_quote_ids || [];
                              if (e.target.checked) {
                                setEditingAgent({ ...editingAgent, assigned_quote_ids: [...currentIds, r.id] });
                              } else {
                                setEditingAgent({ ...editingAgent, assigned_quote_ids: currentIds.filter(id => id !== r.id) });
                              }
                            }}
                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-gray-900">{r.qn_number}</span>
                            <span className="text-xs text-gray-500">{r.clients?.company_name || r.custom_metadata?.client_name || 'Client'}</span>
                          </div>
                        </label>
                      ))}
                      {records.length === 0 && (
                        <div className="p-4 text-center text-xs text-gray-500">No quotes available to assign.</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-4 mt-8">
                  <button onClick={() => setEditingAgent(null)} className="px-6 py-2.5 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors">Cancel</button>
                  <button onClick={() => handleSaveAgent(editingAgent)} disabled={isSavingAgent} className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl text-xs font-bold shadow-sm hover:bg-indigo-700 active:scale-95 transition-transform disabled:opacity-50">
                    {isSavingAgent ? "Saving..." : "Save Agent"}
                  </button>
                </div>
              </div>
            ) : selectedAgentView ? (
              <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-start mb-8 pb-6 border-b border-gray-100">
                  <div>
                    <button onClick={() => setSelectedAgentView(null)} className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-indigo-600 flex items-center gap-1 mb-4">
                      ← Back to Fleet
                    </button>
                    <h3 className="text-2xl font-bold text-gray-900">{selectedAgentView.name}</h3>
                    <p className="text-sm font-medium text-gray-500 mt-1">{selectedAgentView.email}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">Rank {selectedAgentView.importance}</span>
                      <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-3 py-1 rounded-full">{selectedAgentView.task}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => {
                      const assigned = records.filter(r => {
                        let m = r.custom_metadata;
                        if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { m = {}; } }
                        return m?.agent_id === selectedAgentView.id;
                      }).map(r => r.id);
                      setEditingAgent({ ...selectedAgentView, assigned_quote_ids: assigned });
                      setSelectedAgentView(null);
                    }} className="px-6 py-2 bg-gray-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-gray-100 transition-colors border border-gray-200 shadow-sm">
                      Edit Agent
                    </button>
                    <button onClick={() => {
                      handleDeleteAgent(selectedAgentView.id);
                      setSelectedAgentView(null);
                    }} className="px-6 py-2 bg-red-50 text-red-500 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors border border-red-100 shadow-sm">
                      Delete Agent
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex gap-4 border-b border-gray-100">
                    <button onClick={() => setAgentViewTab('follow_up')} className={`pb-3 text-xs font-bold uppercase tracking-widest ${agentViewTab === 'follow_up' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>Follow-ups</button>
                  </div>

                  {(() => {
                    // FOLLOW-UP TAB (Quotes Due)
                    if (agentViewTab === 'follow_up') {
                      const assignedQuotes = records.filter(r => {
                        let m = r.custom_metadata;
                        if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { m = {}; } }
                        return m?.agent_id === selectedAgentView.id;
                      });

                      const displayedQuotes = assignedQuotes.filter(q => {
                        const isHistory = q.follow_up_status != null;
                        if (isHistory) return false;

                        const freq = selectedAgentView.frequency;
                        if (freq === 0 || freq === 'Immediate') return true;

                        const targetDate = new Date(q.created_at);
                        if (typeof freq === 'number') {
                          targetDate.setDate(targetDate.getDate() + freq);
                        } else {
                          if (freq === 'Daily') targetDate.setDate(targetDate.getDate() + 1);
                          if (freq === '3 Days') targetDate.setDate(targetDate.getDate() + 3);
                          if (freq === 'Weekly') targetDate.setDate(targetDate.getDate() + 7);
                        }
                        return new Date() >= targetDate;
                      });

                      if (displayedQuotes.length === 0) {
                        return (
                          <div className="text-center py-16 bg-gray-50/50 border border-dashed border-gray-200 rounded-3xl">
                            <p className="text-sm text-gray-500 font-medium">No quotes due for follow up.</p>
                          </div>
                        );
                      }

                      return displayedQuotes.map((q) => {
                        let meta = q.custom_metadata;
                        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }

                        return (
                          <div key={q.id} className="bg-gray-50/50 border border-gray-200 rounded-2xl p-6 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                              <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{q.qn_number}</p>
                                <p className="text-lg font-bold text-gray-900">{q.clients?.company_name || meta?.client_name || 'Client'}</p>
                              </div>
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await fetch('/api/trigger-agent', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        quoteId: q.id,
                                        tenantId: q.tenant_id,
                                        agentEmail: selectedAgentView.email,
                                        agentId: selectedAgentView.id
                                      })
                                    });
                                    const data = await res.json();
                                    if (data.success) {
                                      alert("Agent Dispatched successfully!");
                                      await fetchRecords(tenantId);
                                    } else {
                                      alert("Failed to dispatch: " + data.error);
                                    }
                                  } catch (e) {
                                    alert("Error: " + e.message);
                                  }
                                }}
                                className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-indigo-700 transition-colors"
                              >
                                Dispatch Agent Manually
                              </button>
                            </div>
                          </div>
                        );
                      });
                    }


                  })()}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {agents.length === 0 ? (
                  <div className="col-span-full text-center py-16 border-2 border-dashed border-gray-200 rounded-3xl">
                    <Bot className="w-10 h-10 mb-4 block opacity-50" />
                    <p className="text-gray-500 font-medium text-sm">No Agents Created Yet</p>
                    <p className="text-gray-400 text-xs mt-1">Create an agent to automate your follow-ups and negotiations.</p>
                  </div>
                ) : (
                  agents.map(a => (
                    <div key={a.id} onClick={() => setSelectedAgentView(a)} className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-indigo-300 group flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{a.name}</h3>
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest">{a.email}</p>
                          </div>
                          <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-full">Rank {a.importance}</span>
                        </div>
                        <p className="text-xs text-gray-600 mb-4 line-clamp-2">{a.task}</p>
                      </div>
                      <div className="flex justify-end pt-4 border-t border-gray-50">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 group-hover:text-indigo-600 transition-colors">View Details & Logs →</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {currentView === "leadgen" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto">
            <header className="mb-6">
              <div className="flex items-center gap-3 flex-wrap"><h2 className="text-3xl font-bold text-gray-900">Lead Generation</h2><DocsLink view="leadgen" /></div>
              <p className="text-sm text-gray-600 mt-1">Enquiries that are not quotes yet. New client emails are read by Bloomgard AI as they arrive: who wrote, what they want, what is in your catalogue, and how promising it looks.</p>
            </header>
            <LeadsView
              isManager={isManager}
              userEmail={user?.email || ''}
              focusLeadId={focusLeadId}
              onOpenQuote={(id) => { setFocusLeadId(''); openQuoteById(id); }}
              onOpenEmail={(id) => { const em = inboxLogs.find((e: any) => e.id === id); setCurrentView('inbox'); if (em) setSelectedInboxEmail(em); }}
              onReviewInForm={(lead) => {
                setEditingId(null); setQn('');
                const base = blueprint.reduce((acc, s) => ({ ...acc, [s.title]: s.is_log ? [] : s.allow_multiple ? [{}] : {} }), {});
                const client = blueprint.find((s: any) => !s.allow_multiple && /client|customer/i.test(s.title));
                const items = blueprint.find((s: any) => s.allow_multiple && /product|item/i.test(s.title));
                if (client) base[client.title] = { client_name: lead.contact?.company || '', contact_person: lead.contact?.name || '', email_id: lead.from_email || '', phone_number: lead.contact?.phone || '', billing_address: [lead.contact?.city, lead.contact?.country].filter(Boolean).join(', ') };
                if (items && lead.requirements?.length) base[items.title] = lead.requirements.map((q: any) => ({ item_code: q.item_code || '', item_name: q.item_name || q.text || '', quantity: q.quantity ? String(q.quantity) : '', uom: q.uom || '', item_rate: q.rate != null ? String(q.rate) : '' }));
                setDynamicData(base);
                setCurrentView('new_entry');
              }}
            />
            {records.some((r: any) => r.status === 'Lead') && (
              <section className="mt-10">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Older leads saved as quotes</h3>
                <ul className="border-t border-gray-200">
                  {records.filter((r: any) => r.status === 'Lead').map((r: any) => (
                    <li key={r.id}><button className="w-full text-left py-2.5 border-b border-gray-200 text-sm flex gap-3 hover:bg-gray-50" onClick={() => setSelectedRecord(r)}><span className="font-mono text-xs text-gray-500">{r.qn_number}</span><span className="text-gray-900">{getManifestTitle(r)}</span></button></li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {currentView === "pipeline" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500 max-w-6xl mx-auto">
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex items-center justify-start gap-6">
                <div className="flex items-center gap-3 flex-wrap"><h2 className="text-3xl font-bold text-gray-900">{currentView === "leadgen" ? "Lead Generation" : "Quotes"}</h2><DocsLink view={currentView} /></div>
                {currentView !== "leadgen" && (
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setQn("");
                      setDynamicData(blueprint.reduce((acc, s) => ({ ...acc, [s.title]: s.is_log ? [] : s.allow_multiple ? [{}] : {} }), {}));
                      setCurrentView('new_entry');
                    }}
                    className="bg-gray-900 text-white px-6 py-2.5 rounded-xl text-xs font-semibold shadow-sm hover:bg-gray-800 active:scale-95 transition-transform"
                  >
                    + New Entry
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <input
                    placeholder="Search anything in a quote: client, item, note…"
                    aria-label="Search quotes"
                    value={quoteFilters.search || ''}
                    className="w-full h-[38px] bg-white border border-gray-200 pl-10 pr-4 rounded-xl text-xs font-medium outline-none focus:border-gray-400 text-gray-700 placeholder:text-gray-400"
                    onChange={e => setQuoteFilters((f: any) => { const n = { ...f }; if (e.target.value) n.search = e.target.value; else delete n.search; return n; })}
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2"><svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div>
                </div>
                <FiltersPopover filters={quoteFilters} onChange={setQuoteFilters} me={user?.email || ''}
                  owners={[...new Set(visibleRecords.map((r: any) => String(r.created_by_email || '')).filter(Boolean))].sort()} />
                <ColumnsPopover all={quoteColumnDefs} value={quoteColumns} onChange={setQuoteColumns} onReset={() => setQuoteColumns(DEFAULT_QUOTE_COLUMNS)} />
              </div>
            </div>

            {/* Saved views: a tab per saved list (its filters, columns and sort), plus All quotes */}
            {currentView === "pipeline" && records.length > 0 && (
              <div className="qv-tabs" role="tablist" aria-label="Saved views">
                <button role="tab" aria-selected={!activeViewId} className={`qv-tab ${!activeViewId ? 'qv-tab--on' : ''}`} onClick={() => openView('')}>All quotes</button>
                {savedViews.map((v) => (
                  <button key={v.id} role="tab" aria-selected={activeViewId === v.id} className={`qv-tab ${activeViewId === v.id ? 'qv-tab--on' : ''}`} onClick={() => openView(v.id)} title={v.shared ? 'Shared with the team' : 'Only you see this view'}>{v.name}</button>
                ))}
                {activeView && viewChanged && (activeView.mine || isManager) && <button className="qv-save" onClick={() => saveCurrentAsView(true)}>Save changes to “{activeView.name}”</button>}
                {(!activeView || viewChanged) && <button className="qv-save" onClick={() => saveCurrentAsView(false)} title="A view saves the search, filters, columns and sort you have now as a tab here, so you can come back to exactly this list in one click.">+ Save as view</button>}
                {activeView && !viewChanged && (activeView.mine || isManager) && <button className="qv-save qv-save--quiet" onClick={deleteView}>Delete view</button>}
                <span className="qv-help" title="A view is a saved list: the search, filters, columns and sort you set, kept as a tab here. Yours are private; a manager can share one with the team from Studio → Saved.">What is a view?</span>
              </div>
            )}

            {/* Status at a glance: click to show only those, click again to clear; several can be on */}
            {records.length > 0 && (
              <div className="qv-status" role="group" aria-label="Filter by status">
                {(allStatuses as string[]).filter((st) => st !== 'Lead').concat(Object.keys(statusCounts).filter((k) => !(allStatuses as string[]).includes(k))).map((st) => {
                  const on = (quoteFilters.statuses || []).includes(st);
                  return (
                    <button key={st} type="button" aria-pressed={on} className={`qv-st ${on ? 'qv-st--on' : ''}`}
                      onClick={() => setQuoteFilters((f: any) => { const cur: string[] = f.statuses || []; const next = on ? cur.filter((x) => x !== st) : [...cur, st]; const n = { ...f }; if (next.length) n.statuses = next; else delete n.statuses; return n; })}>
                      {st}<b>{statusCounts[st] || 0}</b>
                    </button>
                  );
                })}
                <span className="qv-count">{sortedRecords.length} of {visibleRecords.length} quotes</span>
              </div>
            )}
            <div className="mb-3"><FilterChips filters={quoteFilters} onChange={setQuoteFilters} money={(n) => money(n, 'INR')} ownerLabel={(v) => (v === 'me' ? 'Me' : v)} /></div>

            {records.length === 0 && currentView === "pipeline" && (
              <div className="border border-dashed border-gray-300 rounded-2xl p-8 mb-6 text-center">
                <p className="text-sm font-semibold text-gray-900">No quotes yet</p>
                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">Start one with <b>+ New Entry</b>, ask Bloomgard AI on Home to draft one, or forward a client enquiry to your inbound address and turn it into a quote.</p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
                  <button onClick={() => { setEditingId(null); setQn(""); setCurrentView('new_entry'); }} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm active:scale-95 transition-transform">+ New Entry</button>
                  <button onClick={() => { setSettingsSubView('data' as any); setCurrentView('settings'); }} className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm active:scale-95 transition-transform">Import quotes</button>
                </div>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto w-full">
                <table className="min-w-full text-left border-collapse" data-testid="quotes-table">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      {quoteColumns.map((id) => {
                        const def = quoteColumnDefs.find((c) => c.id === id);
                        if (!def) return null;
                        const sorted = quoteSort.key === id || (id === 'amount' && quoteSort.key === 'subtotal');
                        const centre = ['status', 'docs', 'items'].includes(id);
                        return (
                          <th key={id} scope="col" aria-sort={sorted ? (quoteSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-3 py-2 whitespace-nowrap ${centre ? 'text-center w-[1%]' : ''} ${id === 'client' ? 'min-w-[200px]' : ''}`}>
                            {id === 'docs' ? def.label : (
                              <button type="button" className={`qv-th ${sorted ? 'qv-th--on' : ''}`} onClick={() => sortBy(id)} title={`Sort by ${def.label}`}>
                                {def.label}<span aria-hidden>{sorted ? (quoteSort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                              </button>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedRecords.length > 0 ? sortedRecords.map((r, i) => (
                      <tr key={r.id || i} onClick={() => setSelectedRecord(r)} className="hover:bg-indigo-50/40 transition-colors cursor-pointer">
                        {quoteColumns.map((id) => {
                          if (!quoteColumnDefs.some((c) => c.id === id)) return null;
                          const cell = 'px-3 py-2 whitespace-nowrap text-[11px] text-gray-600';
                          switch (id) {
                            case 'ref': return (
                              <td key={id} className="px-3 py-2 whitespace-nowrap">
                                <p className="text-xs font-semibold text-gray-900">{r.qn_number || r.qn || r.id?.slice(0, 8)}</p>
                                {!quoteColumns.includes('date') && <p className="text-[9px] text-gray-500 mt-0.5">{r.date || r.quote_date}</p>}
                              </td>
                            );
                            case 'client': return <td key={id} className={`${cell} truncate max-w-[250px]`}>{columnValue(r, 'client') || '-'}</td>;
                            case 'amount': return <td key={id} className={`${cell} tabular-nums`}>{getFieldValue(r, { name: 'subtotal', sectionTitle: 'Quote Details' })}</td>;
                            case 'items': { const n = lineItems(r); return <td key={id} className={`${cell} text-center tabular-nums`} title={n.map((x: any) => x.item_name || x.name).filter(Boolean).join(', ')}>{n.length || '-'}</td>; }
                            case 'owner': return <td key={id} className={`${cell} truncate max-w-[180px]`}>{r.created_by_email || '-'}</td>;
                            case 'status': return (
                              <td key={id} className="px-3 py-2 whitespace-nowrap w-[1%] text-center">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wide border shadow-sm ${r.status === 'Approved' ? 'bg-green-50 text-green-700 border-green-200' : r.status === 'Lost' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>{r.status || "Inquiry"}</span>
                              </td>
                            );
                            case 'quiet': { const d = columnValue(r, 'quiet'); return <td key={id} className={`${cell} tabular-nums ${d >= 7 && !['approved', 'lost'].includes(String(r.status).toLowerCase()) ? 'text-[var(--sindoor)] font-semibold' : ''}`}>{d}d</td>; }
                            case 'docs': return (
                              <td key={id} className="px-3 py-2 whitespace-nowrap w-[1%] text-center">
                                <button onClick={(e) => { e.stopPropagation(); handleViewDocument(r); }} className="px-2.5 py-1 bg-white border border-gray-200 rounded text-[9px] font-bold uppercase hover:bg-gray-50 active:scale-95 transition-transform text-indigo-600 shadow-sm">View</button>
                              </td>
                            );
                            default: {
                              const v = columnValue(r, id);
                              const money_ = id.startsWith('f:') && /subtotal|total|amount|price|rate|value/i.test(id.split('::')[1] || '');
                              return <td key={id} className={`${cell} truncate max-w-[200px]`}>{v === '' || v == null ? '-' : money_ ? getFieldValue(r, { name: id.split('::')[1], sectionTitle: id.slice(2).split('::')[0] }) : String(formatValue(v, false))}</td>;
                            }
                          }
                        })}
                      </tr>
                    )) : (
                      <tr><td colSpan={quoteColumns.length || 1} className="py-10 text-center">
                        <p className="text-gray-500 text-xs">{visibleRecords.length ? 'No quotes match these filters.' : 'No quotes yet.'}</p>
                        {visibleRecords.length > 0 && <button type="button" onClick={() => setQuoteFilters({})} className="mt-2 text-xs font-semibold text-[var(--neelam)] hover:underline">Clear filters</button>}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {currentView === "inbox" && (
          <div data-testid="inbox-layout" className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-[calc(100dvh-6rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] md:h-[calc(100dvh-2.5rem)] flex gap-6">
            <div className="w-[26rem] shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
              <header className="pr-5 pt-1 pb-4 border-b border-gray-200 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3 min-w-0"><h2 className="text-3xl font-bold text-gray-900">Inbox</h2><DocsLink view="inbox" /></div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEmailDraft({ to: '', subject: '', message: '', attachmentBase64: '', filename: '' }); setShowEmailModal(true); }} className="agent-btn agent-btn--primary"><Pen className="w-3.5 h-3.5" />Compose</button>
                    <button onClick={() => fetchInboxLogs()} className="agent-btn">Refresh</button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search emails..."
                    value={inboxSearch}
                    onChange={(e) => setInboxSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[var(--neelam)] focus:ring-4 focus:ring-[rgba(39,71,216,0.12)] transition-all"
                  />
                </div>
                <div className="qv-tabs" role="tablist" aria-label="Show">
                  {([['all', 'All'], ['enquiries', 'Enquiries'], ['unread', 'Unread'], ['starred', 'Starred']] as const).map(([k, label]) => (
                    <button key={k} role="tab" aria-selected={inboxFilter === k} className={`qv-tab ${inboxFilter === k ? 'qv-tab--on' : ''}`} onClick={() => setInboxFilter(k)}>
                      {label}{k === 'enquiries' ? ` ${Object.values(emailLeads).filter((l) => l.status !== 'discarded' && l.status !== 'converted').length || ''}` : ''}
                    </button>
                  ))}
                </div>
              </header>
              <div className="flex-1 overflow-y-auto">
                {inboxLogs
                  .filter(log => !log.is_deleted)
                  .filter(log => log.subject?.toLowerCase().includes(inboxSearch.toLowerCase()) || log.sender_email?.toLowerCase().includes(inboxSearch.toLowerCase()))
                  .filter(log => inboxFilter === 'all' || (inboxFilter === 'unread' && !log.is_read) || (inboxFilter === 'starred' && log.is_starred)
                    || (inboxFilter === 'enquiries' && emailLeads[log.id] && emailLeads[log.id].status !== 'discarded'))
                  .map((log) => (
                    <div key={log.id} onClick={() => { setSelectedInboxEmail(log); if (!log.is_read) handleInboxAction(log.id, 'is_read', true); }} className={`pl-4 pr-5 py-3.5 border-b border-gray-200 cursor-pointer transition-colors ${selectedInboxEmail?.id === log.id ? 'bg-gray-100 border-l-4 border-l-[var(--sindoor)]' : 'hover:bg-gray-50 border-l-4 border-l-transparent'}`}>
                      <div className="flex justify-between items-start mb-1">
                        <span className={`text-sm truncate pr-2 flex items-center gap-2 ${log.is_read ? 'font-medium text-gray-700' : 'font-semibold text-gray-900'}`}>{!log.is_read && <i className="w-1.5 h-1.5 rounded-full bg-[var(--sindoor)] shrink-0" aria-label="unread" />}<span className="truncate">{log.sender_email}</span></span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-400 whitespace-nowrap tabular-nums">{new Date(log.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                        </div>
                      </div>
                      <div className={`text-[13px] truncate mb-0.5 flex items-center gap-2 ${log.is_read ? 'text-gray-600' : 'font-semibold text-gray-800'}`}>
                        {emailLeads[log.id] && emailLeads[log.id].status !== 'discarded' && (
                          <span className={`inbox-lead inbox-lead--${emailLeads[log.id].temperature}`} title={`Enquiry, scored ${emailLeads[log.id].score}`}>{emailLeads[log.id].status === 'converted' ? 'Quoted' : `Lead · ${emailLeads[log.id].temperature}`}</span>
                        )}
                        <span className="truncate">{log.subject || 'No Subject'}</span>
                      </div>
                      <div className="text-xs text-gray-500 truncate flex items-center justify-between">
                        <span className="truncate pr-4">{log.body_text?.substring(0, 50)}...</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleInboxAction(log.id, 'is_starred', !log.is_starred); }}
                          className={`text-lg transition-colors ${log.is_starred ? 'text-yellow-400 hover:text-yellow-500' : 'text-gray-300 hover:text-gray-400'}`}
                        >
                          {log.is_starred ? <Star className="w-4 h-4 fill-amber-400 text-amber-400" /> : <Star className="w-4 h-4 text-gray-400" />}
                        </button>
                      </div>
                    </div>
                  ))}
                {inboxLogs.filter(log => !log.is_deleted).length === 0 && (
                  <div className="p-8 text-center text-sm text-gray-400">No emails yet. Forward client mail to your inbound address to see it here.</div>
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
              {selectedInboxEmail ? (
                <div className="flex-1 overflow-y-auto px-2 md:px-6 pt-1 pb-6 flex flex-col">
                  <div className="mb-6 pb-6 border-b border-gray-100 dark:border-gray-200 flex justify-between items-start">
                    <div>
                      <h2 className="inbox-subject text-gray-900 mb-2">{selectedInboxEmail.subject}</h2>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-semibold text-gray-800 dark:text-gray-800">{selectedInboxEmail.sender_email}</span>
                        <span>•</span>
                        <span>{new Date(selectedInboxEmail.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleInboxAction(selectedInboxEmail.id, 'is_starred', !selectedInboxEmail.is_starred)} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-lg" title="Star">
                        {selectedInboxEmail.is_starred ? <Star className="w-4 h-4 fill-amber-400 text-amber-400" /> : <Star className="w-4 h-4 text-gray-400" />}
                      </button>
                      <button onClick={() => { handleInboxAction(selectedInboxEmail.id, 'is_deleted', true); setSelectedInboxEmail(null); }} className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors text-lg" title="Delete">
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="text-[15px] leading-relaxed text-gray-800 whitespace-pre-wrap mb-8 flex-1">
                    {selectedInboxEmail.body_text || selectedInboxEmail.body_html || "No Content"}
                  </div>

                  <div className="mb-8 border border-gray-200 dark:border-gray-300 rounded-xl overflow-hidden bg-white shadow-sm">
                    <textarea
                      id="inbox-reply"
                      aria-label="Reply"
                      value={inboxReplyText}
                      onChange={(e) => setInboxReplyText(e.target.value)}
                      placeholder="Type your reply here..."
                      className="w-full p-4 text-sm focus:outline-none resize-y min-h-[120px] bg-transparent"
                    />
                    <div className="bg-gray-50 p-3 border-t border-gray-200 flex justify-between items-center">
                      <div className="flex gap-2">
                        <button className="text-gray-400 hover:text-indigo-600 text-lg px-2" title="Attach File"><Paperclip className="w-4 h-4" /></button>
                      </div>
                      <button
                        onClick={handleInboxReply}
                        disabled={isSendingReply || !inboxReplyText.trim()}
                        className="agent-btn agent-btn--primary"
                      >
                        {isSendingReply ? 'Sending...' : 'Send Reply'}
                      </button>
                    </div>
                  </div>

                  {/* Bloomgard AI's reading of this email: enquiry or not, who, what, catalogue matches, a drafted reply */}
                  <div className="mt-2">
                    <InboxLeadPanel
                      key={selectedInboxEmail.id}
                      emailId={selectedInboxEmail.id}
                      onOpenLead={(id) => { setFocusLeadId(id); setCurrentView('leadgen'); }}
                      onOpenQuote={(id) => openQuoteById(id)}
                      onUseReply={(body) => { setInboxReplyText(body); setTimeout(() => { const el = document.getElementById('inbox-reply'); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); (el as any)?.focus(); }, 30); }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm flex-col gap-3">
                  <div className="agent-orb opacity-60" aria-hidden />
                  <p>Select an email to read it</p>
                </div>
              )}
            </div>
          </div>
        )}

        {currentView === "docs" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto">
            <header className="mb-10"><div className="flex items-center gap-3 flex-wrap"><h2 className="text-3xl font-bold text-gray-900">Document Library</h2><DocsLink view="docs" /></div></header>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {docsRecords.length > 0 ? docsRecords.map((r, i) => (
                <div key={r.id || i} className="relative bg-white border border-gray-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all group flex flex-col">
                  <button onClick={e => { e.stopPropagation(); handleDelete(r.id); }} className="absolute top-4 right-4 w-7 h-7 bg-red-50 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all z-10 active:scale-95"><Trash className="w-4 h-4" /></button>
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-10 h-10 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center font-bold text-[10px] border border-gray-200 group-hover:bg-gray-900 group-hover:text-white transition-colors">PDF</div>
                    <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest bg-gray-50 px-2.5 py-1 rounded-md border border-gray-100">{r.date || r.quote_date}</span>
                  </div>
                  <div className="flex-1"><h4 className="font-bold text-lg mb-1 text-gray-900">{r.qn_number || r.qn}</h4><p className="text-[11px] text-gray-500 mb-6 truncate font-medium">{getManifestTitle(r)}</p></div>
                  <div className="flex gap-2">
                    <button onClick={(e) => { e.stopPropagation(); handleViewDocument(r); }} className="flex-1 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded text-[9px] font-bold uppercase tracking-wider active:scale-95 transition-transform">View</button>
                    <button onClick={(e) => { e.stopPropagation(); handleGeneratePDF(r); }} className="flex-1 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded text-[9px] font-bold uppercase tracking-wider active:scale-95 transition-transform">Export</button>
                  </div>
                </div>
              )) : (
                <div className="col-span-full py-20 text-center text-gray-400 font-medium text-xs tracking-wider border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50">Generate a PDF to add it to the Library.</div>
              )}
            </div>
          </div>
        )}

        {currentView === "new_entry" && (
          <div className="animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-gray-100 pb-6">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3 flex-wrap"><h2 className="text-3xl font-bold text-gray-900">{editingId ? "Revise Entry" : "Create Entry"}</h2><DocsLink view="new_entry" /></div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Quote ID:</span>
                  <input type="text" value={qn} onChange={(e) => setQn(e.target.value)} className="bg-transparent border-b border-dashed border-gray-300 hover:border-gray-500 focus:border-indigo-500 text-xs font-bold text-gray-700 outline-none w-48 transition-colors" placeholder="Auto-generated on Save" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => { setEditingId(null); setCurrentView('pipeline'); setSelectedRecord(null); }} className="px-4 py-2 text-xs font-semibold text-gray-500 hover:text-gray-900 active:scale-95 transition-transform">Discard</button>
                <button onClick={handleSave} disabled={isSavingRecord} className={`bg-white text-white px-6 py-2.5 rounded-xl font-semibold text-xs shadow-sm transition-transform ${isSavingRecord ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800 active:scale-95'}`} style={{ backgroundColor: '#111827' }}>{isSavingRecord ? 'Saving...' : 'Save'}</button>
              </div>
            </div>

            <div className="py-6 mb-2 border-b border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1.5"><label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Ref ID</label><input readOnly className="w-full bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-400 outline-none cursor-not-allowed italic" value={qn || "Auto-generated on save"} /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Date</label><input type="date" className="w-full bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-gray-400" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Assign Agent</label>
                <select className="w-full bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-gray-400" value={dynamicData.agent_id || ""} onChange={e => setDynamicData({ ...dynamicData, agent_id: e.target.value })}>
                  <option value="">None (Manual Follow-up)</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name} - Rank {a.importance}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-8 pb-20">
              {prefillNote && (
                <div className="qf-prefill" role="status" data-testid="prefill-note">
                  <span>Filled <b>{prefillNote.count} field{prefillNote.count === 1 ? '' : 's'}</b> from <b>{prefillNote.client}</b>'s last quote{prefillNote.qn ? ` (${prefillNote.qn})` : ''}. Check them before saving.</span>
                  <button type="button" onClick={() => { setDynamicData(prefillNote.before); setPrefillNote(null); }}>Undo</button>
                  <button type="button" onClick={() => setPrefillNote(null)}>Keep</button>
                </div>
              )}
              {blueprint.filter(s => s.title.toLowerCase() !== "status logs" && !s.is_log).map((section, sIdx) => (
                <div key={sIdx} className="pt-4 pb-8 border-b border-gray-200">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-gray-100 pb-4">
                    <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-3"><span className="w-1.5 h-1.5 bg-[var(--sindoor)] rounded-full"></span>{section.title}</h3>
                    {section.allow_multiple && (
                      <button onClick={() => { const nd = { ...dynamicData }; nd[section.title] = [...(nd[section.title] || []), {}]; setDynamicData(nd); }} className="text-[10px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg uppercase tracking-wider active:scale-95 transition-transform">+ Add Row</button>
                    )}
                  </div>

                  {section.allow_multiple ? (
                    <div className="space-y-4">
                      {(dynamicData[section.title] || []).map((row, rIdx) => (
                        <div key={rIdx} className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-5 pr-10 border-t border-dashed border-gray-200 first:border-t-0">
                          {section.fields.map((f, fIdx) => {
                            const allEntries = findAllEntriesByKey(f.name);
                            const activeEntries = allEntries.filter(entry => {
                              if (!entry.parent_id) return true;
                              const parentEntry = findEntryById(entry.parent_id);
                              if (!parentEntry) return false;
                              const parentValueInForm = row[parentEntry.key_name];
                              if (!parentValueInForm) return false;
                              return parentEntry.values?.some(v => v.value_text === parentValueInForm);
                            });

                            // Value-level cascade: for a child key, keep only the values
                            // linked (parent_value_id) to the parent's currently-selected value.
                            // Values with no parent_value_id stay unconditional (back-compat).
                            const manualValues = activeEntries.flatMap(entry => cascadeValues(entry, name => row[name]));
                            const activeValues = [...manualValues];

                            // A configured "Auto" Master Data key, if anyone has set one up, cascaded
                            // like the manual catalogue — plus every value this field has ever held
                            // across this workspace's quote history, which needs no setup at all.
                            const autoEntries = findAllAutoEntriesByKey(f.name);
                            const autoCascaded = autoEntries.flatMap(entry => cascadeValues(entry, name => row[name])).map(v => v.value_text);
                            const history = autoCapturedValues[section.title]?.[f.name] || [];
                            {
                              const existingTexts = new Set(activeValues.map(v => v.value_text.toLowerCase()));
                              [...autoCascaded, ...history].forEach(vStr => {
                                const key = (vStr || '').toLowerCase();
                                if (vStr && !existingTexts.has(key)) {
                                  existingTexts.add(key);
                                  activeValues.push({ id: `auto-${vStr}`, value_text: vStr, is_default: false });
                                }
                              });
                            }

                            const hasMasterValues = activeValues.length > 0;
                            const isSingleMasterValue = manualValues.length === 1;
                            const isChildField = allEntries.some(e => e.parent_id);

                            // Cascade autofill / reset: keep a child field in sync with its parent's selection.
                            if (manualValues.length > 0) {
                              const allowed = manualValues.map(v => v.value_text);
                              const cur = row[f.name];
                              if (isChildField && cur && !allowed.includes(cur)) {
                                setTimeout(() => updateDynamicDataField(section.title, f.name, manualValues.length === 1 ? manualValues[0].value_text : "", rIdx), 0);
                              } else if (isSingleMasterValue && (!cur || cur === "")) {
                                setTimeout(() => updateDynamicDataField(section.title, f.name, manualValues[0].value_text, rIdx), 0);
                              }
                            }

                            const listId = `datalist-${section.title}-${f.name}-${fIdx}-${rIdx}`;
                            const fieldId = fieldDomId(section.title, f.name, rIdx);

                            return (
                              <div key={fIdx} className="space-y-1.5 relative">
                                <label htmlFor={fieldId} className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">{f.label}</label>
                                {f.type === "dropdown" || f.type === "master_status" ? (
                                  <select
                                    id={fieldId}
                                    value={row[f.name] || ""}
                                    onChange={e => updateDynamicDataField(section.title, f.name, e.target.value, rIdx)}
                                    className="w-full bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-xs font-medium outline-none focus:border-gray-400 shadow-sm"
                                  >
                                    <option value="">Select...</option>
                                    {Array.from(new Set([
                                      ...(f.options ? String(f.options).split(",").map(o => o.trim()).filter(Boolean) : []),
                                      ...activeValues.map(v => v.value_text),
                                    ])).map((o, i) => <option key={i} value={o}>{o}</option>)}
                                  </select>
                                ) : f.type === "logged_in" ? (
                                  <input id={fieldId} type="text" readOnly value={user?.email || ""} className="w-full bg-gray-100 border border-gray-200 px-4 py-2.5 rounded-xl text-xs font-medium outline-none shadow-sm cursor-not-allowed text-gray-500" />
                                ) : f.type === "file" || f.type === "attachment" ? (
                                  <div className="flex flex-col gap-1">
                                    <input id={fieldId} type="file" onChange={e => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (ev) => { updateDynamicDataField(section.title, f.name, ev.target.result, rIdx) }; reader.readAsDataURL(file); } }} className="w-full bg-white border border-gray-200 px-4 py-2 rounded-xl text-xs font-medium outline-none shadow-sm focus:border-gray-400 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" />
                                    {(row[f.name]) && <span className="text-[9px] text-green-600 font-bold ml-1"><Check className="w-3 h-3 inline mr-1" /> File Attached</span>}
                                  </div>
                                ) : f.type === "paragraph" ? (
                                  <div className="flex flex-col gap-1">
                                    <textarea
                                      id={fieldId}
                                      value={row[f.name] || ""}
                                      maxLength={1500}
                                      onChange={e => updateDynamicDataField(section.title, f.name, e.target.value, rIdx)}
                                      className="w-full bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-xs font-medium outline-none focus:border-gray-400 shadow-sm min-h-[100px] resize-y"
                                      placeholder="Enter text..."
                                    />
                                    <span className="text-[9px] text-gray-400 text-right">{(row[f.name] || "").length}/1500</span>
                                  </div>
                                ) : (
                                  <SuggestInput
                                    id={fieldId}
                                    type={f.type === "date" ? "date" : "text"}
                                    inputMode={f.type === "number" ? "decimal" : undefined}
                                    value={f.type === "calculated" && row[f.name] != null && row[f.name] !== "" ? Number(row[f.name]).toFixed(2) : String(row[f.name] ?? "")}
                                    readOnly={f.type === "calculated"}
                                    suggestions={f.type === "calculated" ? [] : activeValues}
                                    onChange={(v) => updateDynamicDataField(section.title, f.name, v, rIdx)}
                                    className={`w-full bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-xs font-medium outline-none focus:border-gray-400 shadow-sm ${f.type === 'calculated' ? 'bg-gray-100 cursor-not-allowed text-indigo-700 font-bold' : ''}`}
                                    placeholder={hasMasterValues ? "Select or type..." : "..."}
                                  />
                                )}
                              </div>
                            );
                          })}
                          <button onClick={() => { const nd = { ...dynamicData }; nd[section.title].splice(rIdx, 1); setDynamicData(nd); }} className="absolute -top-3 -right-3 bg-white text-red-500 hover:text-white hover:bg-red-500 w-7 h-7 rounded-full border border-gray-200 shadow-sm flex items-center justify-center text-xs transition-colors active:scale-95"><X className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {section.fields.map((f, fIdx) => {
                        const allEntries = findAllEntriesByKey(f.name);
                        const activeEntries = allEntries.filter(entry => {
                          if (!entry.parent_id) return true;
                          const parentEntry = findEntryById(entry.parent_id);
                          if (!parentEntry) return false;
                          const parentValueInForm = dynamicData[section.title]?.[parentEntry.key_name];
                          if (!parentValueInForm) return false;
                          return parentEntry.values?.some(v => v.value_text === parentValueInForm);
                        });

                        // Value-level cascade (see multi-row block above for rationale).
                        const manualValues = activeEntries.flatMap(entry => cascadeValues(entry, name => dynamicData[section.title]?.[name]));
                        const activeValues = [...manualValues];

                        // A configured "Auto" Master Data key, if anyone has set one up, cascaded like
                        // the manual catalogue — plus every value this field has ever held across this
                        // workspace's quote history, which needs no setup at all.
                        const autoEntries = findAllAutoEntriesByKey(f.name);
                        const autoCascaded = autoEntries.flatMap(entry => cascadeValues(entry, name => dynamicData[section.title]?.[name])).map(v => v.value_text);
                        const history = autoCapturedValues[section.title]?.[f.name] || [];
                        {
                          const existingTexts = new Set(activeValues.map(v => v.value_text.toLowerCase()));
                          [...autoCascaded, ...history].forEach(vStr => {
                            const key = (vStr || '').toLowerCase();
                            if (vStr && !existingTexts.has(key)) {
                              existingTexts.add(key);
                              activeValues.push({ id: `auto-${vStr}`, value_text: vStr, is_default: false });
                            }
                          });
                        }

                        const hasMasterValues = activeValues.length > 0;
                        const isSingleMasterValue = manualValues.length === 1;
                        const isChildField = allEntries.some(e => e.parent_id);

                        // Cascade autofill / reset: keep a child field in sync with its parent's selection.
                        if (manualValues.length > 0) {
                          const allowed = manualValues.map(v => v.value_text);
                          const cur = dynamicData[section.title]?.[f.name];
                          if (isChildField && cur && !allowed.includes(cur)) {
                            setTimeout(() => updateDynamicDataField(section.title, f.name, manualValues.length === 1 ? manualValues[0].value_text : ""), 0);
                          } else if (isSingleMasterValue && (!cur || cur === "")) {
                            setTimeout(() => updateDynamicDataField(section.title, f.name, manualValues[0].value_text), 0);
                          }
                        }

                        const listId = `datalist-${section.title}-${f.name}-${fIdx}-single`;
                        const fieldId = fieldDomId(section.title, f.name);

                        return (
                          <div key={fIdx} className="space-y-1.5 relative">
                            <label htmlFor={fieldId} className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">{f.label}</label>
                            {f.type === "dropdown" || f.type === "master_status" ? (
                              <select
                                id={fieldId}
                                value={dynamicData[section.title]?.[f.name] || ""}
                                onChange={e => updateDynamicDataField(section.title, f.name, e.target.value)}
                                className="w-full bg-gray-50 hover:bg-white focus:bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-gray-400"
                              >
                                <option value="">Select...</option>
                                {Array.from(new Set([
                                  ...(f.options ? String(f.options).split(",").map(o => o.trim()).filter(Boolean) : []),
                                  ...activeValues.map(v => v.value_text),
                                ])).map((o, i) => <option key={i} value={o}>{o}</option>)}
                              </select>
                            ) : f.type === "logged_in" ? (
                              <input id={fieldId} type="text" readOnly value={user?.email || ""} className="w-full bg-gray-100 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none cursor-not-allowed text-gray-500" />
                            ) : f.type === "file" || f.type === "attachment" ? (
                              <div className="flex flex-col gap-1">
                                <input id={fieldId} type="file" onChange={e => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (ev) => { updateDynamicDataField(section.title, f.name, ev.target.result) }; reader.readAsDataURL(file); } }} className="w-full bg-gray-50 hover:bg-white focus:bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-medium outline-none focus:border-gray-400 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" />
                                {(dynamicData[section.title]?.[f.name]) && <span className="text-[9px] text-green-600 font-bold ml-1"><Check className="w-3 h-3 inline mr-1" /> File Attached</span>}
                              </div>
                            ) : f.type === "paragraph" ? (
                              <div className="flex flex-col gap-1">
                                <textarea
                                  id={fieldId}
                                  value={dynamicData[section.title]?.[f.name] || ""}
                                  maxLength={1500}
                                  onChange={e => updateDynamicDataField(section.title, f.name, e.target.value)}
                                  className="w-full bg-gray-50 hover:bg-white focus:bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-gray-400 min-h-[100px] resize-y"
                                  placeholder="Enter text..."
                                />
                                <span className="text-[9px] text-gray-400 text-right">{(dynamicData[section.title]?.[f.name] || "").length}/1500</span>
                              </div>
                            ) : (
                              <SuggestInput
                                id={fieldId}
                                type={f.type === "date" ? "date" : "text"}
                                inputMode={f.type === "number" ? "decimal" : undefined}
                                value={f.type === "calculated" && dynamicData[section.title]?.[f.name] != null && dynamicData[section.title]?.[f.name] !== "" ? Number(dynamicData[section.title][f.name]).toFixed(2) : String(dynamicData[section.title]?.[f.name] ?? "")}
                                readOnly={f.type === "calculated"}
                                suggestions={f.type === "calculated" ? [] : activeValues}
                                onChange={(v) => updateDynamicDataField(section.title, f.name, v)}
                                onPick={CLIENT_KEYS.has(normalize(f.name)) ? (v) => prefillFromClient(section.title, f.name, v) : undefined}
                                className={`w-full border px-4 py-2.5 rounded-xl text-sm font-medium outline-none shadow-sm ${f.type === 'calculated' ? 'bg-indigo-50 text-indigo-700 font-bold cursor-not-allowed border-gray-200' : 'bg-gray-50 hover:bg-white focus:bg-white focus:border-gray-400 border-gray-200'}`}
                                placeholder={hasMasterValues ? "Select or type..." : "..."}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {currentView === "copilot" && (
          <div className="flex flex-col h-[calc(100vh-6rem)] animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
            <header className="mb-6"><div className="flex items-center gap-3 flex-wrap"><h2 className="text-3xl font-bold text-gray-900">Bloomgard AI</h2><DocsLink view="copilot" /></div><p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-widest mt-1">Deep Data Analysis</p></header>
            <div className="flex-1 bg-white border border-gray-200 rounded-[2rem] shadow-sm flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 bg-gray-50/30">
                {chatHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-50 px-4"><div className="mb-4 flex justify-center"><Brain className="w-12 h-12 text-gray-400" /></div><p className="text-sm font-bold text-gray-700">How can I help you analyze your pipeline today?</p><p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mt-2">I can read your manifest data in real-time.</p></div>
                ) : chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] md:max-w-[80%] rounded-2xl p-5 shadow-sm text-sm leading-relaxed ${msg.role === 'user' ? 'bg-gray-900 text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-700 rounded-bl-none'}`}>{msg.role === 'ai' ? formatAIText(msg.content) : msg.content}</div></div>
                ))}
                {isThinking && <div className="flex justify-start"><div className="bg-white border border-gray-200 rounded-2xl rounded-bl-none p-5 shadow-sm flex items-center gap-3"><div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div><span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Analyzing...</span></div></div>}
                <div ref={chatEndRef} />
              </div>
              <div className="p-4 md:p-6 bg-white border-t border-gray-100">
                <div className="relative max-w-4xl mx-auto flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleSendChatAI("Where has each client/quote reached in follow-ups?")} className="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-[10px] font-semibold hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 shadow-sm transition-colors active:scale-95">Where are clients in follow-ups?</button>
                    <button onClick={() => handleSendChatAI("Summarize recent emails from the inbox")} className="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-[10px] font-semibold hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 shadow-sm transition-colors active:scale-95">Summarize inbox emails</button>
                    <button onClick={() => handleSendChatAI("What master data fields are configured?")} className="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-[10px] font-semibold hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 shadow-sm transition-colors active:scale-95">What master data is set up?</button>
                    <button onClick={() => handleSendChatAI("What are my most sold products?")} className="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-[10px] font-semibold hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 shadow-sm transition-colors active:scale-95">Most sold products</button>
                  </div>
                  <div className="relative">
                    <input value={currentInput} onChange={e => setCurrentInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendChatAI()} placeholder="Ask a question about your pipeline data..." className="w-full bg-gray-50 border border-gray-200 pl-4 md:pl-6 pr-14 py-4 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-indigo-400 shadow-inner" />
                    <button onClick={() => handleSendChatAI()} disabled={isThinking || !currentInput.trim() || !tenantId} className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600 text-white w-9 h-9 rounded-lg flex items-center justify-center hover:bg-indigo-700 disabled:bg-gray-300 shadow-sm active:scale-95 transition-transform">↑</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {selectedRecord && (
        <div
          className="fixed inset-0 z-[150] flex justify-end bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label={`Quote ${selectedRecord.qn_number || selectedRecord.qn || ''}`}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedRecord(null); }}
        >
          <div ref={quotePanelRef} className="w-full max-w-2xl h-full bg-white shadow-2xl p-6 md:p-10 overflow-y-auto animate-in slide-in-from-right duration-300 border-l border-gray-200">
            <FindInQuote scope={quotePanelRef} resetKey={selectedRecord.id || ''} />
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 break-words pr-4">{getManifestTitle()}</h3>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mt-1">Ref ID: {selectedRecord.qn_number || selectedRecord.qn || selectedRecord.id?.slice(0, 8).toUpperCase()}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => loadRecordForEditing(selectedRecord)} className="w-10 h-10 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-600 active:scale-95 transition-transform" title="Edit"><Pen className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(selectedRecord.id)} className="w-10 h-10 bg-red-50 border border-red-100 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-100 active:scale-95 transition-transform" title="Delete"><Trash className="w-4 h-4" /></button>
                <button onClick={() => setSelectedRecord(null)} className="w-10 h-10 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-200 active:scale-95 transition-transform" title="Close" aria-label="Close quote"><X className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 mb-8 p-5 bg-gray-50 border border-gray-200 rounded-2xl items-center shadow-sm">
              <div className="min-w-[120px]">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Current Status</p>
                <p className="text-sm font-bold text-gray-900">{selectedRecord.status}</p>
              </div>
              <div className="flex-1 overflow-x-auto pb-1 scrollbar-hide w-full">
                <div className="flex gap-2 mb-6">
                  {/* The stages are this workspace's own (Field Configurator → Master Status),
                      never a fixed list: a hardcoded one would set a status the pipeline has no name for. */}
                  {selectedRecord.status === 'Lead' ? (
                    <button
                      onClick={() => updateStatus(selectedRecord.id, allStatuses.find((s: string) => s !== 'Lead') || 'Inquiry')}
                      className="px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest shadow-md active:scale-95 transition-all bg-gray-900 text-white w-full"
                    >
                      <Zap className="w-4 h-4 inline mr-2" /> Convert to Quote
                    </button>
                  ) : (
                    (allStatuses as string[]).filter((s) => s !== 'Lead').map(s => (
                      <button
                        key={s}
                        onClick={() => updateStatus(selectedRecord.id, s)}
                        disabled={selectedRecord.status === s}
                        className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-sm active:scale-95 transition-all whitespace-nowrap ${selectedRecord.status === s ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400 hover:text-gray-900'}`}
                      >
                        {s}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <LogModule
              section={statusLogSection}
              entries={statusLogEntries(selectedRecord?.status_logs || extractArray(selectedRecord, "status_logs") || extractArray(selectedRecord, "status logs"))}
              statuses={allStatuses}
              onAdd={(values) => addStatusLogEntry(selectedRecord, values)}
            />

            {blueprint.filter(s => s.is_log).map(sec => (
              <LogModule
                key={sec.title}
                section={sec}
                entries={Array.isArray(selectedRecord?.custom_metadata?.[sec.title]) ? selectedRecord.custom_metadata[sec.title] : []}
                statuses={allStatuses}
                onAdd={(values) => addLogEntry(selectedRecord, sec, values)}
              />
            ))}

            <div className="mb-8">
              <QuoteNotes key={selectedRecord.id} quoteId={selectedRecord.id} qn={selectedRecord.qn_number || selectedRecord.qn} />
            </div>

            <div className="space-y-8">
              {selectedRecord.status === 'Lead' && (
                <div className="bg-amber-50/50 p-6 rounded-2xl border border-amber-200 shadow-sm mb-8">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-4 border-b border-amber-200 pb-2"><Mail className="w-4 h-4 inline mr-2 align-text-bottom" /> Original Lead Email</h4>
                  <div className="mb-4">
                    <p className="text-[9px] font-bold text-amber-600 uppercase">Subject</p>
                    <p className="text-sm font-medium text-amber-900">{selectedRecord.custom_metadata?.lead_email_subject || 'No Subject'}</p>
                  </div>
                  <div className="mb-6">
                    <p className="text-[9px] font-bold text-amber-600 uppercase">Message Body</p>
                    <div className="bg-white/80 p-4 rounded-xl text-xs text-gray-800 whitespace-pre-wrap border border-amber-100 mt-1 max-h-60 overflow-y-auto">
                      {selectedRecord.custom_metadata?.lead_email_body || 'No Body'}
                    </div>
                  </div>

                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 mb-4 border-b border-indigo-100 pb-2 mt-8"><Bot className="w-4 h-4 inline mr-2 align-text-bottom" /> AI Extracted Items</h4>
                  {selectedRecord.custom_metadata?.ai_parsed_items?.length > 0 ? (
                    <div className="space-y-3">
                      {selectedRecord.custom_metadata.ai_parsed_items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg border border-indigo-50">
                          <div>
                            <p className="text-sm font-bold text-gray-900">{item.item_name}</p>
                            <p className="text-[9px] text-gray-400">Est. Price: ${item.unit_price}</p>
                          </div>
                          <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">x{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 italic">No items extracted.</p>
                  )}
                </div>
              )}

              {blueprint.filter(s => s.title.toLowerCase() !== "status logs" && !s.is_log).map((section, sIdx) => {
                return (
                  <div key={sIdx} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-4 border-b border-gray-100 pb-2">{section.title}</h4>
                    {section.allow_multiple ? (
                      <div className="space-y-4">
                        {(() => {
                          const items = extractArray(selectedRecord, section.title);
                          if (!items || !items.length) return <p className="text-xs text-gray-400 font-medium">No records attached.</p>;
                          return items.map((row, rIdx) => (
                            <div key={rIdx} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                              {section.fields.filter(f => f.type !== 'master_status').map((f, fIdx) => {
                                const v = extractValue(row, f.name);
                                return (
                                  <div key={fIdx} className="flex flex-col">
                                    <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{f.label}</p>
                                    <p className="text-sm font-medium text-gray-900 break-words">
                                      {f.type === 'file' || f.type === 'attachment' ? (v ? <span className="text-green-600 text-[10px] font-bold"><Check className="w-3 h-3 inline mr-1" /> File Secured</span> : '—') : (v !== '' && v != null ? String(v) : '—')}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          ));
                        })()}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
                        {section.fields.filter(f => f.type !== 'master_status').map((f, fIdx) => {
                          const raw = extractValue(selectedRecord, f.name, section.title);
                          // a subtotal nobody typed is the sum of the line items, not a blank
                          const v = (raw === '' || raw == null) && /subtotal|amount|^total$/i.test(String(f.name))
                            ? itemsTotal(selectedRecord) : raw;
                          return (
                            <div key={fIdx} className="flex flex-col border-b border-gray-50 pb-2">
                              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{f.label}</p>
                              <p className="text-sm font-medium text-gray-900 break-words">
                                {f.type === 'file' || f.type === 'attachment' ? (v ? <span className="text-green-600 text-[10px] font-bold"><Check className="w-3 h-3 inline mr-1" /> File Secured</span> : '—')
                                  // a phone number is a call away; an email address opens a new message
                                  : v && /phone|mobile|whatsapp/i.test(f.name) ? <a className="underline decoration-dotted underline-offset-4" href={`tel:${String(v).replace(/[^0-9+]/g, '')}`}>{String(v)}</a>
                                  : v && /email/i.test(f.name) && /@/.test(String(v)) ? <a className="underline decoration-dotted underline-offset-4" href={`mailto:${String(v).trim()}`}>{String(v)}</a>
                                  : (v != null && v !== '' ? String(v) : '—')}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-12 pt-8 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4">
              <button onClick={() => handleViewDocument(selectedRecord)} className="bg-white border border-gray-200 text-gray-700 py-3.5 rounded-xl font-semibold text-xs hover:bg-gray-50 shadow-sm active:scale-95 transition-transform">Preview PDF</button>
              <button onClick={() => handleGeneratePDF(selectedRecord)} className="bg-white border border-gray-200 text-gray-700 py-3.5 rounded-xl font-semibold text-xs hover:bg-gray-50 shadow-sm active:scale-95 transition-transform">Download PDF</button>
              <button
                onClick={async () => {
                  try {
                    const r = await platformApi(`/api/quotes/${selectedRecord.id}/share`, { json: {} });
                    setShareLink({ quoteId: selectedRecord.id, url: r.url });
                    navigator.clipboard?.writeText(r.url).catch(() => {});
                  } catch (e: any) { alert(e.message); }
                }}
                className="bg-white border border-gray-200 text-gray-700 py-3.5 rounded-xl font-semibold text-xs hover:bg-gray-50 shadow-sm active:scale-95 transition-transform"
              >Client link</button>
              <button onClick={() => handleOpenEmailComposer(selectedRecord)} className="bg-gray-900 text-white py-3.5 rounded-xl font-semibold text-xs shadow-md hover:bg-gray-800 active:scale-95 transition-transform">Mail</button>
            </div>
            {shareLink?.quoteId === selectedRecord.id && (
              <div className="share-box" data-testid="share-link">
                <p><b>Link copied.</b> Your client can open the quote in a browser and accept it or ask for changes; you hear about both, and it goes in the Status Log. Making a new link retires this one.</p>
                <div className="share-box__row">
                  <input readOnly value={shareLink.url} aria-label="Client link" onFocus={(e) => e.currentTarget.select()} />
                  <button onClick={() => navigator.clipboard?.writeText(shareLink.url).catch(() => {})}>Copy</button>
                  <a href={`${shareLink.url}?preview=1`} target="_blank" rel="noreferrer">Preview</a>
                </div>
              </div>
            )}
            <div className="pb-8" />
          </div>
        </div>
      )}

      {viewingDoc && (
        <div className="fixed inset-0 z-[200] bg-gray-900/60 backdrop-blur-sm flex justify-center items-center p-4 lg:p-8 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-white w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 bg-gray-900 text-white rounded-lg flex items-center justify-center font-bold text-[10px] uppercase shadow-sm">DOC</div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">{viewingDoc.title}</h3>
                  <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mt-0.5">Rendered Preview</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => {
                  if (iframeRef.current && iframeRef.current.contentDocument) {
                    setViewingDoc({ ...viewingDoc, html: iframeRef.current.contentDocument.documentElement.outerHTML });
                    alert("Edits saved! You can now export or email the updated document.");
                  }
                }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-sm active:scale-95 transition-transform">Save Edits</button>
                <button onClick={() => downloadDirectPDF(viewingDoc.html, viewingDoc.title)} className="bg-white border border-gray-200 hover:border-gray-400 text-gray-700 px-4 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider shadow-sm hidden sm:block active:scale-95 transition-transform">Export PDF</button>
                <button onClick={() => setViewingDoc(null)} className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-red-500 hover:text-white rounded-lg font-bold transition-colors active:scale-95 transition-transform"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100 p-2 md:p-6 flex justify-center overflow-hidden">
              <div className="w-full max-w-4xl h-full bg-white shadow-xl overflow-y-auto border border-gray-300">
                <iframe
                  ref={iframeRef}
                  srcDoc={viewingDoc.html}
                  onLoad={(e) => {
                    try {
                      const doc = e.target.contentDocument;
                      if (doc) doc.body.contentEditable = "true";
                    } catch (err) { }
                  }}
                  className="w-full h-full border-none"
                  title="Document Render"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {previewTemplate && (
        <div className="fixed inset-0 z-[300] bg-gray-900/50 backdrop-blur-[2px] flex items-center justify-center p-6" onMouseDown={e => { if (e.target === e.currentTarget) setPreviewTemplate(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden border border-gray-200">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">{previewTemplate.name}</h3>
              <span className="agent-label">preview with placeholder tags</span>
              <button onClick={() => setPreviewTemplate(null)} className="fc-icon ml-auto" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <iframe title={`${previewTemplate.name} preview`} srcDoc={previewTemplate.html} className="flex-1 w-full bg-white" />
          </div>
        </div>
      )}

      {showEmailModal && (
        <div className="fixed inset-0 z-[300] bg-gray-900/40 backdrop-blur-[2px] flex justify-center items-end sm:items-center p-0 sm:p-6 animate-in fade-in duration-200" onMouseDown={e => { if (e.target === e.currentTarget) setShowEmailModal(false); }}>
          <div className="compose w-full sm:max-w-2xl bg-white sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 max-h-[100dvh] sm:max-h-[90vh] animate-in slide-in-from-bottom-4 duration-300" role="dialog" aria-label="New message">
            <div className="flex items-center gap-3 px-5 pt-4 pb-3">
              <span className="agent-orb agent-orb--sm" aria-hidden />
              <h3 className="compose__title">New message</h3>
              <button onClick={() => setShowEmailModal(false)} className="fc-icon ml-auto" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="compose__row">
                <span className="compose__label">From</span>
                <select value={emailSenderPref} onChange={e => setEmailSenderPref(e.target.value as 'personal' | 'common')} className="compose__field compose__select" aria-label="Send as">
                  <option value="personal">{user?.email} (personal)</option>
                  {customSender && <option value="common">{customSender} (workspace)</option>}
                </select>
              </div>
              <div className="compose__row">
                <span className="compose__label">To</span>
                <input type="email" value={emailDraft.to} onChange={e => setEmailDraft({ ...emailDraft, to: e.target.value })} placeholder="client@company.com" className="compose__field" aria-label="Recipient" />
                {!(showCcBcc || emailDraft.cc || emailDraft.bcc) && <button type="button" onClick={() => setShowCcBcc(true)} className="compose__link">Cc / Bcc</button>}
              </div>
              {(showCcBcc || emailDraft.cc || emailDraft.bcc) && (
                <>
                  <div className="compose__row"><span className="compose__label">Cc</span><input type="text" value={emailDraft.cc || ""} onChange={e => setEmailDraft({ ...emailDraft, cc: e.target.value })} placeholder="Optional" className="compose__field" aria-label="CC" /></div>
                  <div className="compose__row"><span className="compose__label">Bcc</span><input type="text" value={emailDraft.bcc || ""} onChange={e => setEmailDraft({ ...emailDraft, bcc: e.target.value })} placeholder="Optional" className="compose__field" aria-label="BCC" /></div>
                </>
              )}
              <div className="compose__row">
                <input value={emailDraft.subject} onChange={e => setEmailDraft({ ...emailDraft, subject: e.target.value })} placeholder="Subject" className="compose__field compose__subject" aria-label="Subject" />
              </div>
              <div className="px-5 pt-3 pb-2 relative">
                <textarea rows={10} value={emailDraft.message} onChange={e => setEmailDraft({ ...emailDraft, message: e.target.value })} placeholder="Write your message, or let Bloomgard AI draft it…" className="compose__body" aria-label="Message" />
                <button onClick={handleGenerateEmailDraft} disabled={isGeneratingDraft} className="agent-chip compose__ai" type="button">
                  {isGeneratingDraft ? <span className="w-3.5 h-3.5 border-2 border-[var(--neelam)] border-t-transparent rounded-full animate-spin inline-block" /> : <Sparkles className="w-3.5 h-3.5" />} {isGeneratingDraft ? "Drafting…" : "Draft with AI"}
                </button>
              </div>

              <div className="px-5 pb-4 space-y-2">
                <label className="agent-label">Attachments</label>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col md:flex-row gap-3">
                    <button
                      onClick={() => document.getElementById('email-file-upload').click()}
                      className="agent-btn flex-1 justify-center"
                    >
                      <div className="flex items-center justify-center gap-2"><Laptop className="w-4 h-4" /> Upload from Device</div>
                    </button>

                    <div className="flex-1 relative">
                      <select
                        className="agent-btn w-full appearance-none cursor-pointer pr-8"
                        onChange={async (e) => {
                          const id = e.target.value;
                          if (!id) return;
                          const quote = docsRecords.find(r => String(r.id) === String(id));
                          if (quote) {
                            const html = await getRenderedHTML(quote);

                            const html2pdf = (await import('html2pdf.js')).default;
                            const opt = {
                              margin: 0.5,
                              filename: `${quote.qn_number} - ${getManifestTitle(quote)}.pdf`,
                              image: { type: 'jpeg', quality: 0.98 },
                              html2canvas: { scale: 2 },
                              jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
                            };

                            const pdfBase64 = await html2pdf().set(opt).from(html).output('datauristring');
                            const filename = `${quote.qn_number} - ${getManifestTitle(quote)}.pdf`;

                            setEmailDraft(prev => ({
                              ...prev,
                              attachments: [...(prev.attachments || []), { filename, base64: pdfBase64 }]
                            }));
                          }
                          e.target.value = ""; // reset
                        }}
                      >
                        <option value="">Select CMA Document...</option>
                        {docsRecords.map(r => (
                          <option key={r.id} value={r.id}>{r.qn_number} - {getManifestTitle(r)}</option>
                        ))}
                      </select>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] text-gray-500">▼</span>
                    </div>
                  </div>

                  <input
                    id="email-file-upload"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files);
                      files.forEach(file => {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setEmailDraft(prev => ({
                            ...prev,
                            attachments: [...(prev.attachments || []), { filename: file.name, base64: ev.target.result }]
                          }));
                        };
                        reader.readAsDataURL(file);
                      });
                      e.target.value = '';
                    }}
                  />
                </div>

                {emailDraft.attachments && emailDraft.attachments.length > 0 && (
                  <div className="mt-3 space-y-2 max-h-40 overflow-y-auto pr-1">
                    {emailDraft.attachments.map((att, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white border border-gray-200 px-3 py-2 rounded-xl">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-7 h-7 bg-white rounded flex items-center justify-center text-xs shadow-sm border border-gray-100 shrink-0"><Paperclip className="w-4 h-4" /></div>
                          <p className="text-[11px] font-semibold text-gray-800 truncate">{att.filename}</p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEmailDraft(p => ({
                              ...p,
                              attachments: p.attachments.filter((_, i) => i !== idx)
                            }));
                          }}
                          className="fc-icon fc-icon--danger shrink-0" aria-label={`Remove ${att.filename}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex items-center gap-3">
              <button onClick={() => setShowEmailModal(false)} className="agent-btn">Discard</button>
              <span className="text-[11px] text-gray-500 hidden sm:inline">{emailDraft.attachments?.length ? `${emailDraft.attachments.length} attachment${emailDraft.attachments.length === 1 ? "" : "s"}` : "Replies come back to your Inbox"}</span>
              <button onClick={sendDraftedEmail} disabled={isSending} className="agent-create !py-2.5 !px-6 ml-auto disabled:opacity-60">{isSending ? 'Sending…' : 'Send'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
