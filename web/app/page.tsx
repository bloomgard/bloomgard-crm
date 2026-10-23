"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Instrument_Serif, Geist, Geist_Mono } from "next/font/google";
import {
  ArrowRight, ArrowUpRight, Bell, Bot, Check, ChevronDown, Copy, Database, FileText,
  Inbox, Magnet, Mail, Moon, Sun, X,
} from "lucide-react";
import styles from "./landing.module.css";

const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display" });
const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

const CONTACT_EMAIL = "support@bloomgard.co";
const PREWRITTEN_BODY =
  "Hello%20Bloomgard%20Team%2C%0A%0AI%20am%20interested%20in%20upgrading%20my%20operational%20infrastructure.%20Please%20reach%20out%20to%20discuss%20implementation%20and%20details.%0A%0AThank%20you%2C%0A%5BYour%20Name%5D";

/* ───────────────────────── Motif belt ─────────────────────────
   Line-drawn Indian motifs (buta, rangoli star, chakra, lotus) joined by small
   jaali diamonds, drawn procedurally so the geometry stays exact. */
const polar = (r: number, deg: number): [number, number] => {
  const a = (deg - 90) * (Math.PI / 180);
  return [+(r * Math.cos(a)).toFixed(2), +(r * Math.sin(a)).toFixed(2)];
};

function Chakra() {
  const spokes = Array.from({ length: 12 }, (_, i) => {
    const [x1, y1] = polar(4, i * 30);
    const [x2, y2] = polar(16, i * 30);
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
  });
  const dots = Array.from({ length: 12 }, (_, i) => {
    const [x, y] = polar(20.5, i * 30 + 15);
    return <circle key={i} cx={x} cy={y} r="1.3" />;
  });
  return (
    <g>
      <circle r="26" /><circle r="16" /><circle r="4" />
      {spokes}{dots}
    </g>
  );
}

function RangoliStar() {
  const pts = Array.from({ length: 16 }, (_, i) => polar(i % 2 === 0 ? 26 : 11, i * 22.5).join(",")).join(" ");
  const dots = Array.from({ length: 8 }, (_, i) => {
    const [x, y] = polar(15.5, i * 45 + 22.5);
    return <circle key={i} cx={x} cy={y} r="1.3" />;
  });
  return (
    <g>
      <polygon points={pts} /><circle r="5" />{dots}
    </g>
  );
}

function Lotus() {
  const petals = Array.from({ length: 8 }, (_, i) => (
    <ellipse key={i} cx="0" cy="-15" rx="6.5" ry="12" transform={`rotate(${i * 45})`} />
  ));
  const inner = Array.from({ length: 8 }, (_, i) => (
    <ellipse key={i} cx="0" cy="-7" rx="3" ry="6" transform={`rotate(${i * 45 + 22.5})`} />
  ));
  return <g>{petals}{inner}<circle r="3" /></g>;
}

function Buta() {
  return (
    <g>
      <path d="M0 -27 C15 -27 24 -12 19 4 C14 21 -5 29 -15 19 C-23 11 -17 -2 -6 0 C0 2 2 9 -3 12" />
      <path d="M1 -17 C9 -17 14 -9 12 0" />
      <circle cx="-2" cy="-5" r="1.4" /><circle cx="6" cy="-8" r="1.2" />
    </g>
  );
}

function Diamond() {
  return (
    <g>
      <path d="M0 -10 10 0 0 10 -10 0Z" /><circle r="2.6" />
    </g>
  );
}

function BeltTile() {
  // 4 motifs + 4 diamonds, 96px per cell; tile = 768px wide.
  const cells: Array<[React.ReactNode, string]> = [
    [<Buta key="b" />, "#ffffff"], [<Diamond key="d1" />, "#e5a03a"],
    [<RangoliStar key="r" />, "#e5a03a"], [<Diamond key="d2" />, "#7f9bff"],
    [<Chakra key="c" />, "#7f9bff"], [<Diamond key="d3" />, "#ffffff"],
    [<Lotus key="l" />, "#ffffff"], [<Diamond key="d4" />, "#e5a03a"],
  ];
  return (
    <svg viewBox="0 0 768 64" width="768" height="64" aria-hidden="true" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {cells.map(([node, colour], i) => (
        <g key={i} transform={`translate(${48 + i * 96} 32)`} stroke={colour}>{node}</g>
      ))}
    </svg>
  );
}

function MotifBelt() {
  return (
    <div className={styles.belt} aria-hidden="true">
      <div className={styles.beltClip}>
        <div className={styles.beltTrack}>
          {[0, 1, 2, 3].map((n) => <BeltTile key={n} />)}
        </div>
      </div>
      <div className={styles.medallion}>
        <svg viewBox="0 0 120 120" fill="none" stroke="#e5a03a" strokeWidth="1.25" strokeLinecap="round">
          <rect x="30" y="30" width="60" height="60" />
          <rect x="30" y="30" width="60" height="60" transform="rotate(45 60 60)" />
          <circle cx="60" cy="60" r="12" />
          <circle cx="60" cy="60" r="42.5" strokeDasharray="2 4" />
        </svg>
      </div>
    </div>
  );
}

/* ───────────────────────── Content ───────────────────────── */
const PILLARS = [
  { icon: FileText, title: "Quotations", text: "Build quotes from fields you define, revise them as Rev-1, Rev-2, and send a PDF in your own template." },
  { icon: Database, title: "Master data", text: "Your catalogue as a spreadsheet. Import from Excel, link code to name to unit to rate, and let one choice fill the line." },
  { icon: Inbox, title: "Inbox", text: "Every client reply is filed against its quote by the QN number. Star, sort and answer without leaving Bloomgard." },
  { icon: Bell, title: "Follow-ups", text: "Quiet quotes surface hottest first. Search by client, set how many days count as quiet, and approve a follow-up." },
  { icon: Magnet, title: "Lead capture", text: "Turn an enquiry email into a quotation in one click, with the line items already matched to your catalogue." },
  { icon: Bot, title: "Bloomgard AI", text: "Ask about your pipeline, inbox and catalogue in plain English. Answers come from your own records." },
];

const STEPS = [
  { t: "Capture", d: "A client replies to your quote. It reaches the workspace through your own inbound address and is filed against the right quote by its QN number." },
  { t: "Read", d: "Bloomgard AI summarises the email and pulls out the client and each line item, resolving products against your Master Data." },
  { t: "Draft", d: "A reply is written from your catalogue, your tone settings and your team's recent replies, and signed with your name and title." },
  { t: "Approve", d: "You read it, edit it, and press Send reply. It goes from your workspace address on the same thread, and is logged to the quote." },
  { t: "Sort", d: "The thread moves from Incoming to Outgoing. Quotes that go quiet reappear under Pending follow-ups, hottest first." },
];

const FEATURES = [
  {
    title: "Quotations", sub: "From first line to PDF",
    items: [
      "Field Configurator: your sections, fields and calculations",
      "Revisions numbered Rev-1, Rev-2 and so on",
      "Quote PDF from your own HTML template and logo",
      "Email quotes with attachments from your domain",
      "Pipeline statuses you name yourself",
      "Docs library of every generated quote",
    ],
  },
  {
    title: "Master data", sub: "One catalogue, no re-typing",
    items: [
      "Excel-style grid with inline editing",
      "Import from Excel with column mapping",
      "Parent-to-child links: code, name, unit, rate",
      "Dropdowns in the quote form fed from the grid",
      "Plain-English notes the AI reads per field",
      "Values captured automatically from your quotes",
    ],
  },
  {
    title: "Email", sub: "Capture, read, draft",
    items: [
      "Inbound address for the workspace, and one per person",
      "Replies filed against quotes by QN number",
      "Inbox with read, star and delete",
      "AI summary and extracted quote for every email",
      "Reply drafts grounded in Master Data",
      "Send from your own verified domain",
    ],
  },
  {
    title: "Follow-ups", sub: "Nothing quietly goes cold",
    items: [
      "Pending, Incoming and Outgoing tabs",
      "Hot, warm and cold by days since contact",
      "Search by quote number or client",
      "Days-quiet filter you control",
      "Approve an AI follow-up with one click",
      "Every message logged to the quote",
    ],
  },
  {
    title: "AI controls", sub: "You set the voice",
    items: [
      "Tone, English level and urgency settings",
      "Standing instructions the AI must follow",
      "Routing rules for topics that need a colleague",
      "Your name, title and sign-off on every draft",
      "Replies are drafted, never sent for you",
      "Token and email usage tracked per workspace",
    ],
  },
  {
    title: "Teams and admin", sub: "Built for more than one person",
    items: [
      "Agent, manager and admin roles",
      "Managers see the whole pipeline, agents their own",
      "Invite teammates from Settings",
      "Workspace data isolated by row-level security",
      "Dashboard with charts across the pipeline",
      "Light and dark themes, wallpapers and layouts",
    ],
  },
];

const AI_GUARDS = [
  { t: "Never sent on its own", d: "Replies to client emails arrive as drafts. The send button is always pressed by a person." },
  { t: "Only what is in your catalogue", d: "If a product is not in Master Data, the draft says you will confirm. It does not invent one." },
  { t: "Writes as you", d: "Your name, title and sign-off, with the tone your team already uses. No placeholder brackets to clean up." },
];

const STANDARD = [
  "Unlimited quote PDFs",
  "Pipeline tracking across the team",
  "Master Data grid and Excel import",
  "Inbox with inbound capture",
  "Dashboards for managers and agents",
  "Light, dark and wallpaper themes",
];

const WITH_AI = [
  "Everything in Standard",
  "AI summary and extracted quote for every email",
  "Reply drafts grounded in your Master Data",
  "AI follow-ups, sent when you approve",
  "Quote from an enquiry email in one click",
  "Bloomgard AI: ask your records questions",
];

const FAQS = [
  { q: "Does the AI send emails on its own?", a: "No. Replies to inbound client emails are saved as drafts for you to read, edit and send. Follow-up emails go out only when you approve them." },
  { q: "What happens if a client asks about a product we do not list?", a: "The draft says you will confirm and follow up. Bloomgard AI is told to use only the codes, names, units and rates in your Master Data, and never to guess." },
  { q: "Can we load our catalogue from Excel?", a: "Yes. Upload a sheet, map each column to a field, and Bloomgard builds the code, name, unit and rate links for you. You can edit any cell afterwards." },
  { q: "Where do client replies arrive?", a: "At an inbound address for your workspace, and optionally one per person. Forward from your own mailbox or use it as the reply-to on quotes." },
  { q: "Who can see what?", a: "Agents see their own quotes and threads. Managers and admins see the whole pipeline. Each workspace's data is separated at database level." },
  { q: "How do we get started?", a: "Contact us and we will set up a workspace, verify your sending domain, and load your catalogue with you." },
];

type Theme = "system" | "light" | "dark";

/* ───────────────────────── Page ───────────────────────── */
export default function BloomgardLanding() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [showPortal, setShowPortal] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [isDark, setIsDark] = useState(false);

  // The Android (Capacitor) shell opens the app straight to the sign-in screen.
  useEffect(() => {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
    const native =
      !!w.Capacitor?.isNativePlatform?.() ||
      window.origin.includes("capacitor") ||
      (window.location.hostname === "localhost" && /;\s*wv\)/.test(navigator.userAgent));
    if (native) router.replace("/login");
  }, [router]);

  // Theme: follow the system until the visitor picks one.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("bg-landing-theme") as Theme | null;
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setIsDark(theme === "dark" || (theme === "system" && mq.matches));
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [theme]);
  const toggleTheme = () => {
    const next: Theme = isDark ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("bg-landing-theme", next); } catch { /* ignore */ }
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Smooth anchors, unless the visitor prefers reduced motion.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const el = document.documentElement;
    const prev = el.style.scrollBehavior;
    el.style.scrollBehavior = "smooth";
    return () => { el.style.scrollBehavior = prev; };
  }, []);

  // Sections rise once as they enter. Everything is visible before this runs.
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!els || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { (e.target as HTMLElement).dataset.in = "1"; io.unobserve(e.target); }
      }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    els.forEach((el) => { if (el.getBoundingClientRect().top > window.innerHeight) io.observe(el); });
    return () => io.disconnect();
  }, []);

  // Escape closes dialogs.
  useEffect(() => {
    if (!showPortal && !showContact) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setShowPortal(false); setShowContact(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPortal, showContact]);

  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(CONTACT_EMAIL); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const openContact = () => { setShowPortal(false); setShowContact(true); };

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${display.variable} ${sans.variable} ${mono.variable}`}
      data-theme={theme === "system" ? undefined : theme}
    >
      <a href="#main" className={styles.skip}>Skip to content</a>

      {/* Nav */}
      <header className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`}>
        <div className={styles.navInner}>
          <a href="#top" className={styles.brand} aria-label="Bloomgard, home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.brandImg} src={isDark ? "/brand/wordmark-kora.png" : "/brand/wordmark-kajal.png"} alt="Bloomgard" width={178} height={34} />
          </a>
          <nav className={styles.navLinks} aria-label="Sections">
            <a href="#platform">Platform</a>
            <a href="#email">Email and AI</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">Questions</a>
          </nav>
          <div className={styles.navActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost} ${styles.iconBtn}`}
              onClick={toggleTheme}
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            >
              {isDark ? <Sun /> : <Moon />}
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setShowPortal(true)}>Log in</button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary} ${styles.navHide}`} onClick={openContact}>Book a demo</button>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section id="top" className={`${styles.hero} ${styles.grain}`}>
          <div className={styles.glowBlue} aria-hidden="true" />
          <div className={styles.glowOrange} aria-hidden="true" />
          <div className={styles.mandala} aria-hidden="true" />
          <div className={styles.wrap}>
            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <div className={`${styles.heroEyebrow} ${styles.heroIn}`}>
                  <span className={styles.eyebrow}>(01) Bloomgard CRM</span>
                </div>
                <h1 className={`${styles.display} ${styles.h1} ${styles.heroIn} ${styles.d1}`}>
                  From first email to signed quote, <em>without re-typing.</em>
                </h1>
                <p className={`${styles.lede} ${styles.heroIn} ${styles.d2}`}>
                  Bloomgard runs your quotations, inbox and follow-ups in one workspace. The AI reads every client
                  email, drafts the reply from your own catalogue, and leaves the send button to you.
                </p>
                <div className={`${styles.ctaRow} ${styles.heroIn} ${styles.d3}`}>
                  <button type="button" className={`${styles.btn} ${styles.btnLg} ${styles.btnPrimary}`} onClick={openContact}>
                    Book a demo <ArrowRight />
                  </button>
                  <button type="button" className={`${styles.btn} ${styles.btnLg} ${styles.btnSecondary}`} onClick={() => setShowPortal(true)}>
                    Log in
                  </button>
                </div>
                <p className={`${styles.heroNote} ${styles.heroIn} ${styles.d4}`}>Built for teams that quote for a living</p>
              </div>

              <figure className={`${styles.heroIn} ${styles.d3}`} aria-label="Example of an AI-drafted reply">
                <div className={styles.thread}>
                  <div className={styles.threadHead}>
                    <span className={`${styles.eyebrow} ${styles.mono}`}>Inbox · QN-2026-014</span>
                    <span className={`${styles.badge} ${styles.badgeInfo}`}>Incoming</span>
                  </div>
                  <div className={styles.threadBody}>
                    <div className={styles.msg}>
                      <div className={styles.msgMeta}><strong>Ramesh Iyer</strong><span>Northgate Logistics</span></div>
                      <p className={styles.msgText}>
                        Please confirm the rate for BX-CORR-A4 and your lead time for 4,000 pieces to Pune.
                      </p>
                    </div>
                    <div className={styles.draft}>
                      <div className={styles.draftHead}>
                        <span className={styles.eyebrow}>AI suggested reply</span>
                        <span className={`${styles.badge} ${styles.badgeWarn}`}>Draft, not sent</span>
                      </div>
                      <p className={styles.draftText}>
                        Hi Ramesh, BX-CORR-A4 (Corrugated Box A4, 305 × 215 × 250 mm) is ₹24.00 per piece. I will
                        confirm the lead time for 4,000 pieces to Pune and come back to you today.
                        <span className={styles.sig}>Asha Menon · Sales manager</span>
                      </p>
                    </div>
                  </div>
                  <div className={styles.threadFoot}>
                    <span className={`${styles.badge} ${styles.badgeSuccess}`}>Rate from Master Data</span>
                    <span style={{ display: "inline-flex", gap: 8 }} aria-hidden="true">
                      <span className={`${styles.mockBtn} ${styles.mockBtnGhost}`}>Edit</span>
                      <span className={`${styles.mockBtn} ${styles.mockBtnPrimary}`}>Send reply</span>
                    </span>
                  </div>
                </div>
                <figcaption className={styles.caption}>Sample data. In your workspace the rates, codes and sign-off are your own.</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <MotifBelt />

        {/* Platform */}
        <section id="platform" className={styles.section}>
          <div className={styles.wrap}>
            <div className={styles.split}>
              <div className={styles.labelCol}><span className={styles.eyebrow}>(02) Platform</span></div>
              <div className={styles.bodyCol}>
                <div data-reveal>
                  <h2 className={`${styles.display} ${styles.h2}`} style={{ maxWidth: "20ch" }}>One workspace for the whole quote.</h2>
                  <p className={styles.sectionIntro}>
                    Most quotes live across a mailbox, a spreadsheet and a PDF folder. Bloomgard keeps the catalogue,
                    the conversation and the follow-up in the same place, so nobody has to ask where it stands.
                  </p>
                </div>
                <div className={`${styles.panels} ${styles.panels3}`} style={{ marginTop: 56 }} data-reveal>
                  {PILLARS.map(({ icon: Icon, title, text }) => (
                    <div key={title} className={styles.pillar}>
                      <Icon className={styles.pillarIcon} aria-hidden="true" />
                      <h3 className={styles.pillarTitle}>{title}</h3>
                      <p className={styles.pillarText}>{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Email and AI */}
        <section id="email" className={styles.section} style={{ paddingTop: 0 }}>
          <div className={styles.wrap}>
            <div className={styles.split}>
              <div className={styles.labelCol}><span className={styles.eyebrow}>(03) Email and AI</span></div>
              <div className={styles.bodyCol}>
                <div data-reveal>
                  <h2 className={`${styles.display} ${styles.h2}`} style={{ maxWidth: "20ch" }}>Every email, read and answered.</h2>
                  <p className={styles.sectionIntro}>
                    Five steps, in this order, for every client message. Two of them are yours.
                  </p>
                </div>
                <div className={styles.flow} style={{ marginTop: 56 }}>
                  <ol className={styles.steps} data-reveal>
                    {STEPS.map((s, i) => (
                      <li key={s.t} className={styles.step}>
                        <span className={styles.stepNum}>{String(i + 1).padStart(2, "0")}</span>
                        <h3 className={styles.stepTitle}>{s.t}</h3>
                        <p className={styles.stepText}>{s.d}</p>
                      </li>
                    ))}
                  </ol>

                  <div className={styles.sticky} data-reveal>
                    <div className={styles.fu} role="img" aria-label="Example of the Follow-ups screen with hot, warm and cold quotes">
                      <div className={styles.fuBar}>
                        <div className={styles.tabs}>
                          <span className={`${styles.tab} ${styles.tabOn}`}>Pending <span className={styles.tabCount}>3</span></span>
                          <span className={styles.tab}>Incoming <span className={styles.tabCount}>2</span></span>
                          <span className={styles.tab}>Outgoing <span className={styles.tabCount}>5</span></span>
                        </div>
                        <span className={styles.fuSearch}>Search quote #, client…</span>
                      </div>
                      <div>
                        <div className={styles.fuRow}>
                          <span className={styles.fuName}>Apex Packaging</span>
                          <span className={`${styles.fuMeta} ${styles.mono}`}>QN-2026-021 · 2 days quiet</span>
                          <span className={styles.fuAside}><span className={`${styles.badge} ${styles.badgeDanger}`}>Hot</span><span className={styles.fuAmt}>₹6,98,250</span></span>
                        </div>
                        <div className={styles.fuRow}>
                          <span className={styles.fuName}>Delta Buildmart</span>
                          <span className={`${styles.fuMeta} ${styles.mono}`}>QN-2026-017 · 8 days quiet</span>
                          <span className={styles.fuAside}><span className={`${styles.badge} ${styles.badgeWarn}`}>Warm</span><span className={styles.fuAmt}>₹2,74,050</span></span>
                        </div>
                        <div className={styles.fuRow}>
                          <span className={styles.fuName}>Northgate Logistics</span>
                          <span className={`${styles.fuMeta} ${styles.mono}`}>QN-2026-009 · 19 days quiet</span>
                          <span className={styles.fuAside}><span className={`${styles.badge} ${styles.badgeInfo}`}>Cold</span><span className={styles.fuAmt}>₹1,12,400</span></span>
                        </div>
                      </div>
                    </div>
                    <p className={styles.caption}>Sample data. Temperature is days since the last contact; an unanswered client reply is always hot.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Blue band */}
        <section className={styles.band} aria-labelledby="band-title">
          <div className={styles.bandMandala} aria-hidden="true" />
          <div className={styles.wrap} style={{ position: "relative" }}>
            <div className={styles.split}>
              <div className={styles.labelCol}><span className={styles.eyebrow}>(04) How the AI behaves</span></div>
              <div className={styles.bodyCol} data-reveal>
                <h2 id="band-title" className={`${styles.display} ${styles.h2}`} style={{ maxWidth: "16ch" }}>
                  The AI drafts. <em>You decide.</em>
                </h2>
                <div className={styles.bandCols}>
                  {AI_GUARDS.map((g) => (
                    <div key={g.t} className={styles.bandCol}>
                      <h3 className={styles.bandColTitle}>{g.t}</h3>
                      <p className={styles.bandColText}>{g.d}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className={styles.section}>
          <div className={styles.wrap}>
            <div className={styles.split}>
              <div className={styles.labelCol}><span className={styles.eyebrow}>(05) Features</span></div>
              <div className={styles.bodyCol}>
                <div data-reveal>
                  <h2 className={`${styles.display} ${styles.h2}`} style={{ maxWidth: "20ch" }}>Everything in the workspace.</h2>
                  <p className={styles.sectionIntro}>What you can use today, grouped by the job it does.</p>
                </div>
                <div className={`${styles.panels} ${styles.panels3}`} style={{ marginTop: 56 }} data-reveal>
                  {FEATURES.map((g) => (
                    <div key={g.title}>
                      <h3 className={styles.featHead}>{g.title}</h3>
                      <p className={styles.featSub}>{g.sub}</p>
                      <ul className={styles.featList}>
                        {g.items.map((it) => <li key={it}>{it}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className={styles.section} style={{ paddingTop: 0 }}>
          <div className={styles.wrap}>
            <div className={styles.split}>
              <div className={styles.labelCol}><span className={styles.eyebrow}>(06) Plans</span></div>
              <div className={styles.bodyCol}>
                <div data-reveal>
                  <h2 className={`${styles.display} ${styles.h2}`} style={{ maxWidth: "18ch" }}>Two plans, priced to your team.</h2>
                  <p className={styles.sectionIntro}>Tell us how many people quote and how many emails you handle. We will send a price, not a pricing page.</p>
                </div>
                <div className={styles.plans} style={{ marginTop: 56 }} data-reveal>
                  <div className={styles.plan}>
                    <span className={styles.eyebrow}>The workspace</span>
                    <h3 className={styles.planName}>Standard</h3>
                    <p className={styles.planBlurb}>Quotations, Master Data, inbox and dashboards for the whole team.</p>
                    <ul className={styles.planList}>
                      {STANDARD.map((f) => <li key={f}><Check aria-hidden="true" />{f}</li>)}
                    </ul>
                    <div className={styles.planFoot}>
                      <button type="button" className={`${styles.btn} ${styles.btnLg} ${styles.btnSecondary}`} onClick={openContact}>Contact sales</button>
                    </div>
                  </div>
                  <div className={`${styles.plan} ${styles.planInk}`}>
                    <span className={styles.eyebrow}>With the AI core</span>
                    <h3 className={styles.planName}>Bloomgard AI</h3>
                    <p className={styles.planBlurb}>Everything in Standard, plus an assistant that reads the inbox and drafts for you.</p>
                    <ul className={styles.planList}>
                      {WITH_AI.map((f) => <li key={f}><Check aria-hidden="true" />{f}</li>)}
                    </ul>
                    <div className={styles.planFoot}>
                      <button type="button" className={`${styles.btn} ${styles.btnLg} ${styles.btnOnDark}`} onClick={openContact}>Contact sales <ArrowUpRight /></button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={styles.section} style={{ paddingTop: 0 }}>
          <div className={styles.wrap}>
            <div className={styles.split}>
              <div className={styles.labelCol}><span className={styles.eyebrow}>(07) Questions</span></div>
              <div className={styles.bodyCol}>
                <h2 className={`${styles.display} ${styles.h2}`} style={{ maxWidth: "18ch", marginBottom: 48 }} data-reveal>Before you ask.</h2>
                <div className={styles.faq} data-reveal>
                  {FAQS.map((f) => (
                    <details key={f.q}>
                      <summary>{f.q}<ChevronDown aria-hidden="true" /></summary>
                      <p className={styles.faqBody}>{f.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.cta} style={{ paddingTop: 0 }}>
          <div className={styles.wrap}>
            <div className={styles.ctaGrid} data-reveal>
              <h2 className={`${styles.display} ${styles.h2}`} style={{ maxWidth: "16ch" }}>See it on your own emails.</h2>
              <div className={`${styles.ctaRow}`} style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <button type="button" className={`${styles.btn} ${styles.btnLg} ${styles.btnPrimary}`} onClick={openContact}>Book a demo <ArrowRight /></button>
                <button type="button" className={`${styles.btn} ${styles.btnLg} ${styles.btnSecondary}`} onClick={() => setShowPortal(true)}>Log in</button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.footGrid}>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.footBrandImg} src="/brand/wordmark-kora.png" alt="Bloomgard" width={199} height={38} />
              <p className={styles.footTag}>Quotes, email and follow-ups for teams that quote for a living. Made in Mumbai.</p>
            </div>
            <div>
              <p className={styles.footColTitle}>Product</p>
              <div className={styles.footLinks}>
                <a href="#platform">Platform</a>
                <a href="#email">Email and AI</a>
                <a href="#features">Features</a>
                <a href="#pricing">Plans</a>
              </div>
            </div>
            <div>
              <p className={styles.footColTitle}>Sign in</p>
              <div className={styles.footLinks}>
                <button type="button" onClick={() => router.push("/login")}>Client portal</button>
                <button type="button" onClick={() => router.push("/boss/login")}>Bloomgard Suite</button>
              </div>
            </div>
            <div>
              <p className={styles.footColTitle}>Contact</p>
              <div className={styles.footLinks}>
                <button type="button" onClick={openContact}>Book a demo</button>
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </div>
            </div>
          </div>
          <div className={styles.footBase}>
            <span>© Bloomgard 2026</span>
            <span>Mumbai, India</span>
          </div>
        </div>
      </footer>

      {/* Sign-in dialog */}
      {showPortal && (
        <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setShowPortal(false); }}>
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="portal-title">
            <div className={styles.dialogHead}>
              <div>
                <h2 id="portal-title" className={styles.dialogTitle}>Sign in</h2>
                <p className={styles.dialogText}>Choose where you are going.</p>
              </div>
              <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.iconBtn}`} onClick={() => setShowPortal(false)} aria-label="Close"><X /></button>
            </div>
            <button type="button" className={styles.choice} onClick={() => router.push("/login")} autoFocus>
              <span><span className={styles.choiceTitle} style={{ display: "block" }}>Client portal</span><span className={styles.choiceText}>Open your workspace.</span></span>
              <ArrowRight aria-hidden="true" />
            </button>
            <button type="button" className={styles.choice} onClick={() => router.push("/boss/login")}>
              <span><span className={styles.choiceTitle} style={{ display: "block" }}>Bloomgard Suite</span><span className={styles.choiceText}>Admin identity required.</span></span>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Contact dialog */}
      {showContact && (
        <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setShowContact(false); }}>
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="contact-title">
            <div className={styles.dialogHead}>
              <div>
                <h2 id="contact-title" className={styles.dialogTitle}>Contact sales</h2>
                <p className={styles.dialogText}>Copy our address, or open a message in Gmail.</p>
              </div>
              <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.iconBtn}`} onClick={() => setShowContact(false)} aria-label="Close"><X /></button>
            </div>
            <div className={styles.emailBox}><span className={styles.mono} style={{ fontSize: 14 }}>{CONTACT_EMAIL}</span></div>
            <div className={styles.dialogActions}>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={copyEmail} autoFocus>
                {copied ? <><Check /> Copied</> : <><Copy /> Copy email address</>}
              </button>
              <a
                className={`${styles.btn} ${styles.btnSecondary}`}
                href={`https://mail.google.com/mail/?view=cm&fs=1&to=${CONTACT_EMAIL}&su=Bloomgard%20Enterprise%20Inquiry&body=${PREWRITTEN_BODY}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Mail /> Open in Gmail
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
