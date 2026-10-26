/* =====================================================================
   KovaApps (p21) - the 86 apps in Claude's connector directory under
   automation and workflow (and the neighbouring shelves you named), what
   makes each the best in its market, and what Kova took from it.

   Honest about evidence: each app says what its reasons rest on
     r  user reviews (G2, Capterra, Reddit summaries, independent write-ups)
     v  mostly the company's own claims
     t  little public information yet
   "take" is what Kova does because of it, and "go" opens that part of
   Kova (flow, cmd, actions, team, maya, prep, plans, inbox), so the
   reasons are not just a list: each one points at something that works.

   Lives behind "How the best tools do it" on Automations and in the
   search bar; the AI team reads it through the best_tools tool.
   ===================================================================== */
window.KovaApps=(function(){
  'use strict';
  var G={auto:'Automation',work:'Work and projects',docs:'Docs and decks',build:'Build and host',ops:'Logs and errors',
    crm:'Customers and CRM',mkt:'Marketing',data:'Data and documents',talk:'Talk and meet'};
  var GO={flow:'Build a rule',cmd:'Open the search bar',actions:'Pull action items from a call',team:'Ask your AI team',
    maya:'Send a video to Maya',prep:'Meeting prep',inbox:'Notifications',plans:'Plans'};
  /* [id, name, group, best at, five reasons, what Kova took, evidence, go] */
  var D=[
    ['zapier','Zapier','auto','Connecting the most apps with the least setup',
      ['8,000+ app connections, the widest catalogue','Plain trigger and action steps anyone can follow','Multi-step Zaps with filters and paths','Test each step before it goes live','Huge library of ready-made templates'],
      'Rules are a chain of steps with filters, and Test it shows what each step would do before you save.','r','flow'],
    ['make','Make','auto','Visual automation at a lower price than Zapier',
      ['A visual canvas that shows the whole flow','Routers and branches for complex logic','Cheaper per operation at volume','Fine control over data mapping','Run history you can replay step by step'],
      'Every run is kept with why it ran, skipped or failed, and the steps read top to bottom like a canvas.','r','flow'],
    ['n8n','n8n','auto','Automation developers can self-host and own',
      ['Self-host for free, keep data in house','Code nodes when no-code runs out','Strong AI agent building blocks','Fair-code licence, active community','Priced per workflow run, not per step'],
      'Rules are plain data you can read, and the AI team can build one for you from a sentence.','r','flow'],
    ['workato','Workato','auto','Enterprise automation with governance',
      ['"Recipes" business teams can build','Deep enterprise connectors (SAP, NetSuite)','Audit trails and role-based control','Handles high volume reliably','Strong support for IT and business together'],
      'Ready-made recipes on Automations, and every run is logged with who or what made the change.','r','flow'],
    ['celigo','Celigo','auto','Ecommerce and ERP integration',
      ['Prebuilt flows for NetSuite and Shopify','Clear field mapping screens','Error queues you can fix and retry','EDI support for suppliers','Support that knows the systems'],
      'A failed step says exactly which step and why, with what to do next.','r','flow'],
    ['windmill','Windmill','auto','Turning scripts into workflows and small apps',
      ['Open source and very fast','Scripts in Python, TypeScript, Go or SQL','Auto-generated UIs for each script','Schedules and webhooks built in','Self-host or use their cloud'],
      'Schedules are a trigger: every day or weekday at a time.','v','flow'],
    ['retool','Retool','auto','Internal tools on top of your data',
      ['Drag-and-drop UI over databases and APIs','Ship internal tools far faster','Permissions and approval steps for safe edits','Non-engineers can build end to end','Connects Postgres, Snowflake, Slack, Zendesk'],
      'Anything that sends or posts waits for your approval; reading never does.','r','team'],
    ['processstreet','Process Street','auto','Checklists and SOPs that run themselves',
      ['Checklists with conditional steps','Approvals built into the flow','Audit trail for compliance','Recurring runs on a schedule','Easy for frontline teams'],
      'Processes and checklists in the Work OS; a rule can create the next task when one finishes.','r','flow'],
    ['fibery','Fibery','auto','A connected workspace from feedback to roadmap',
      ['Relations between any kinds of records','Feedback linked to the features it asks for','Many views of the same data','Built-in automations and formulas','One tool instead of five'],
      'Tasks know their project, their meeting and their goal, so a rule can act on any of them.','r','flow'],
    ['codewords','CodeWords','auto','Building automations by chatting',
      ['Describe the workflow in words','AI writes and runs the steps','Fast to a first working version','Hosted for you','Good for non-technical builders'],
      'Say the rule: "When a call ends, make a write-up task, wait 2 days, then remind me".','t','flow'],
    ['duvo','Duvo','auto','AI workers for retail and consumer goods operations',
      ['Agents that do back-office tasks end to end','Built for retail and CPG workflows','Works across the tools a team already has','Hands off to people when unsure','Measured on time saved'],
      'Your AI team does the work and stops to ask you when a step leaves Kova.','t','team'],
    ['lorikeet','Lorikeet','auto','AI support for complex, regulated customers',
      ['Handles multi-step support, not just FAQs','Follows the company’s own procedures','Made for fintech and health','Escalates with full context','Measured on resolved tickets'],
      'Teammates follow a playbook you write, and hand the job back to you with context when they cannot finish.','v','team'],

    ['monday','monday.com','work','Visual work management with easy automations',
      ['Colourful boards anyone understands','"When this, do that" automations in plain words','Many views: table, kanban, timeline, calendar','Dashboards across boards','Templates for almost any team'],
      'Recipes written in monday’s plain language, and tasks in table and kanban.','r','flow'],
    ['asana','Asana','work','Clarity on who does what, by when',
      ['Every task has one owner and a date','Goals linked to the work under them','Clean, calm interface','Rules for routine hand-offs','Portfolio view for leaders'],
      'Action items from a call keep their owner and due date; goals track their progress.','r','actions'],
    ['clickup','ClickUp','work','One app for everything, with a generous free plan',
      ['Tasks, docs, goals, chat and whiteboards in one','Very customisable statuses and fields','Free plan covers a lot','Built-in AI across the workspace','Many views of the same tasks'],
      'Work, health and the AI team in one app, without a More button hiding half of it.','r','cmd'],
    ['linear','Linear','work','Speed: the fastest issue tracker',
      ['Keyboard first, with ⌘K for everything','Instant, no loading spinners','Opinionated workflows that keep teams fast','Cycles and triage built in','Deep GitHub integration'],
      '⌘K opens a search bar for everything in Kova, and creates a task from one line.','r','cmd'],
    ['notion','Notion','work','Docs and databases in one flexible space',
      ['Pages and databases that link together','Many views of one database','Huge template gallery','Writing feels good','AI that knows your workspace'],
      'Search finds tasks, projects, meetings, files, teammates and screens together.','r','cmd'],
    ['trello','Trello','work','The simplest visual board',
      ['Cards and lists anyone gets in seconds','Drag and drop','Butler automations','Power-ups for extras','Free for small teams'],
      'Kanban for tasks, and rules that move a card when something happens.','r','flow'],
    ['smartsheet','Smartsheet','work','Spreadsheet-style project management for big organisations',
      ['Feels like a spreadsheet, works like a PM tool','Gantt charts and dependencies','Strong governance and admin','Reports across many sheets','Approvals and forms'],
      'Rules with filters ("only if it is critical") so automations do not fire on everything.','r','flow'],
    ['wrike','Wrike','work','Enterprise projects with proofing',
      ['Proofing and approval of creative work','Custom workflows per team','Resource and workload views','Strong security','Request forms that become tasks'],
      'A post waits for your OK before it goes out; Maya never posts on her own unless you sent it.','r','maya'],
    ['airtable','Airtable','work','A database that feels like a spreadsheet',
      ['Linked records between tables','Interfaces you can build on top','Automations on record changes','Many field types','Easy for non-developers'],
      'A rule can fire on a status change, a new task, a goal update or a call ending.','r','flow'],
    ['atlassian','Atlassian (Jira, Confluence)','work','Software teams at scale',
      ['Jira workflows for any process','Confluence docs linked to issues','Huge marketplace of add-ons','Scales to very large companies','Agile boards, sprints and reports'],
      'Statuses, owners and a full activity log of every change.','r','flow'],
    ['superhuman','Superhuman','work','The fastest email experience',
      ['Keyboard shortcuts for everything','Split inbox by what matters','Snooze and follow-up reminders','AI writes replies in your voice','Clean, fast design'],
      'Keyboard-first search, and follow-up reminders that happen on their own after a wait.','r','cmd'],
    ['padlet','Padlet','work','Visual boards for classes and groups',
      ['A wall anyone can post to','Images, links and video on one board','No account needed to contribute','Templates for teaching','Simple moderation'],
      'Learn and study tools sit next to work, in the same app.','r','cmd'],
    ['miro','Miro','work','The online whiteboard for teams',
      ['Infinite canvas for workshops','Thousands of templates','Real-time collaboration','Integrates with Jira, Asana and more','AI that clusters sticky notes'],
      'Meeting notes become grouped action items and decisions, like sorting stickies after a workshop.','r','actions'],
    ['lucid','Lucid','work','Diagrams and process maps',
      ['Flowcharts and org charts done fast','Data-linked diagrams','Shapes for every kind of diagram','Collaboration in real time','Works with Confluence and Google'],
      'Each rule reads as a clear flow: when, only if, then.','r','flow'],

    ['gamma','Gamma','docs','Decks and documents made by AI in minutes',
      ['A first deck in about a minute from a prompt','Looks designed without design work','Cards instead of fixed slides, good on phones','Easy to edit after the AI draft','Share as a link with analytics'],
      'Maya writes the caption and headline for each platform from one video.','r','maya'],
    ['googledocs','Google Docs','docs','Writing together in real time',
      ['Many people edit at once','Comments and suggestions','Free with a Google account','Version history','Works everywhere'],
      'The AI team writes drafts you approve; nothing is sent without you.','r','team'],
    ['zohoshow','Zoho Show','docs','Presentations inside the Zoho suite',
      ['Part of the Zoho apps you already pay for','Clean slide editor','Present to remote audiences','Works with Zoho CRM data','Low cost'],
      'Everything in one place, so you are not paying for five tools.','v','plans'],

    ['vercel','Vercel','build','Shipping web apps with the best developer experience',
      ['Push to Git, get a live site','Preview link for every change','Fast global edge network','Made by the Next.js team','Generous free tier for small projects'],
      'Kova runs on Vercel: every push to the branch gets its own preview.','r','plans'],
    ['netlify','Netlify','build','Simple hosting for sites and functions',
      ['Drag-and-drop deploys','Forms and functions built in','Clear, simple pricing','Branch previews','Good for static and Jamstack sites'],
      'Kept as Kova’s backup host.','r','plans'],
    ['supabase','Supabase','build','Open-source Postgres backend',
      ['A full Postgres database, not a toy','Auth, storage and realtime included','Open source, no lock-in','Generous free tier','Great docs and dashboard'],
      'Your progress photos and media are stored in Supabase.','r','plans'],
    ['railway','Railway','build','Deploying apps and databases with no config',
      ['Deploy from GitHub in minutes','Databases one click away','Pay per second of use','Clean dashboard and logs','Good for side projects that grow'],
      'Kova’s server runs as small functions that only cost when used.','r','plans'],
    ['render','Render','build','Long-running servers and background jobs',
      ['Stateful services and workers','Managed Postgres and Redis','Predictable pricing','Auto deploys from Git','Easier than raw cloud'],
      'Background work (your team’s requests, post comments) runs on a timer on the server.','r','team'],
    ['harness','Harness','build','CI/CD with built-in safety checks',
      ['Pipelines from build to deploy','Automatic rollback when metrics drop','Cost management for cloud','Feature flags','Strong for big engineering teams'],
      'Every change Kova’s team makes can be undone from the job’s history.','r','team'],
    ['controlplane','Control Plane','build','Running containers across clouds from one place',
      ['One interface for AWS, GCP and Azure','Move or add a cloud in a few clicks','Reach cloud services without storing keys','PCI, SOC 2 and HIPAA eligible','CLI, API and Terraform'],
      'Keys never sit in the app; the server holds them, and you type your own.','v','plans'],
    ['mittwald','mittwald','build','Hosting for agencies in Germany',
      ['Fast, personal support with no chatbot','Agency-friendly dashboard','Strong CMS performance (TYPO3, WordPress)','GDPR, data stays in Germany','CLI and API'],
      'Plain, specific error messages instead of "something went wrong".','r','flow'],
    ['alpic','Alpic','build','One-click hosting for MCP servers',
      ['Deploy an MCP server in one step','Made for AI tools and agents','Handles auth and scaling','Logs for every tool call','Free to start'],
      'Every tool your AI team uses is logged in the job, step by step.','t','team'],
    ['manufact','Manufact','build','Building and running MCP servers',
      ['Open-source framework for MCP','Cloud to host the servers','Works with many AI clients','Inspector to test tools','Quick start templates'],
      'Your AI team’s tools are listed per teammate, and you switch them on or off.','t','team'],
    ['circleci','CircleCI','build','Fast, reliable continuous integration',
      ['Fast builds with caching and parallel runs','Config as code','Big library of orbs','Insights into flaky tests','Works with GitHub and Bitbucket'],
      'Kova’s own tests run on every push; nothing ships with a failing test.','r','plans'],
    ['bitrise','Bitrise','build','CI/CD for mobile apps',
      ['Made for iOS and Android','Ready steps for signing and stores','Mac machines in the cloud','Release management','Fast mobile caches'],
      'Kova’s iPhone app is packaged from the same code as the website.','r','plans'],
    ['cloudbees','CloudBees','build','Enterprise CI on Jenkins',
      ['Jenkins at enterprise scale','Governance and compliance','Feature management','Supports many teams on one platform','Long track record'],
      'One activity log for every change, by you, a rule or a teammate.','r','flow'],
    ['runway','Runway','build','Mobile release management',
      ['One place to coordinate a release','Checklists for each step to the store','Integrates Jira, GitHub, Slack and CI','Staged rollouts with health checks','Release calendar'],
      'Checklists inside tasks, and rules that create the next step automatically.','v','flow'],
    ['cloudflare','Cloudflare','build','A fast, cheap global edge',
      ['300+ locations near every user','Free tier that covers a lot','DDoS protection built in','Workers for code at the edge','Great DNS'],
      'Pages load the first screen fast and fetch the rest after, so Kova opens in under 3 seconds.','r','cmd'],
    ['lovable','Lovable','build','From a prompt to a working app',
      ['Prompt to full-stack app, fast','Keeps context over many edits','Push the code to your own GitHub','Great for prototypes and MVPs','Non-technical friendly'],
      'Say what you want and see it before it is saved; nothing is a black box.','r','flow'],
    ['macaly','Macaly','build','Building websites and apps by chatting',
      ['Describe the site, get a working one','Hosting included','Edits by conversation','Quick for small businesses','No code to manage'],
      'Rules are built from a sentence, then shown as steps you can edit.','t','flow'],

    ['sentry','Sentry','ops','Finding and fixing errors fast',
      ['Set up in minutes','The exact line and context of each error','Groups the same error together','Release tracking','Performance tracing'],
      '"Why it failed" on every rule: which step, what stopped it, and what to do.','r','flow'],
    ['datadog','Datadog','ops','Monitoring everything in one place',
      ['Metrics, logs and traces together','Beautiful dashboards','Hundreds of integrations','Alerts on anomalies','Scales to huge systems'],
      'Run counts for each rule (ran, skipped, failed) at a glance.','r','flow'],
    ['posthog','PostHog','ops','All-in-one product analytics',
      ['Analytics, replays, flags and tests in one','Open source, can self-host','Generous free tier','SQL access to your data','Made for engineers'],
      'Kova measures itself: taps to log a meal, time to first screen.','r','cmd'],
    ['grafana','Grafana','ops','Open dashboards on any data',
      ['Connects to almost any data source','Free and open source','Beautiful, flexible panels','Alerting built in','Huge community'],
      'Traction shows each post’s numbers next to what people are saying.','r','maya'],
    ['pagerduty','PagerDuty','ops','Waking the right person when it breaks',
      ['On-call schedules and escalation','Alerts grouped so you are not spammed','Runbooks attached to incidents','Status pages','Post-incident reviews'],
      'Notifications only for what you asked for, each rule with its own switch.','r','inbox'],
    ['montecarlo','Monte Carlo','ops','Catching broken data before people do',
      ['Finds data problems automatically','Shows where bad data came from','Alerts the owner of the table','Works with Snowflake, BigQuery, dbt','Tracks data reliability over time'],
      'A rule that points at something deleted says so instead of failing silently.','r','flow'],

    ['intercom','Intercom','crm','AI customer service that resolves on its own',
      ['Fin AI agent resolves about half of questions','Priced per resolution, not per seat','Inbox, help centre and bots together','Proactive messages to users','Hands off to a person with context'],
      'Your AI team answers and acts, and hands back to you with context when it should.','r','team'],
    ['customerio','Customer.io','crm','Messages triggered by what people do',
      ['Journeys driven by behaviour and events','Waits and branches in the journey','Email, SMS, push and in-app','Uses your own data model','Strong for product-led companies'],
      'A step can wait ("2 days later, remind me"), so follow-ups happen on their own.','r','flow'],
    ['hubspot','HubSpot','crm','CRM and marketing in one place',
      ['Free CRM to start','Marketing, sales and service together','Easy for small teams','Huge app marketplace','Great learning content'],
      'One place for work, people and follow-ups.','r','actions'],
    ['salesforce','Salesforce','crm','The most customisable enterprise CRM',
      ['Customise anything','Biggest ecosystem of apps and partners','Scales to the largest companies','Strong reporting','Flows for complex automation'],
      'Automations with filters and multiple steps, for the processes you actually have.','r','flow'],
    ['zohocrm','Zoho CRM','crm','A full CRM at a lower price',
      ['Good value for the features','Works with 40+ Zoho apps','Blueprints for sales processes','AI assistant Zia','Flexible customisation'],
      'Everything in one subscription with add-ons, not five bills.','r','plans'],
    ['pipedrive','Pipedrive','crm','A visual sales pipeline',
      ['See every deal as a card in its stage','Activity-based selling: always a next step','Simple to adopt','Automations for routine steps','Good mobile app'],
      'Every finished call gets a next step: a write-up today and a check-in later.','r','actions'],
    ['close','Close','crm','Calling and emailing from the CRM',
      ['Built-in calling and SMS','Email sequences','Fast for inside sales','Reports on activity','No add-ons needed for calling'],
      'Follow-ups are created for you after each call.','r','actions'],
    ['dayai','Day AI','crm','A CRM that fills itself in from calls and email',
      ['Builds records from your conversations','No manual data entry','Answers questions about your customers','Summaries of every relationship','Made AI-first'],
      'Notes from a call become tasks with owners and dates, without typing them twice.','t','actions'],
    ['clarify','Clarify','crm','An autonomous AI CRM',
      ['Captures meetings and email on its own','Keeps records updated','Suggests next steps','Modern, fast interface','For startups'],
      'Next steps come out of your notes; you tick the ones that are real.','t','actions'],
    ['nutshell','Nutshell','crm','Simple CRM with email marketing for small teams',
      ['Easy to learn','Email marketing included','Unlimited contacts on plans','Good support','Pipelines and reporting'],
      'Simple by default, with depth behind a tap.','r','cmd'],
    ['bigin','Bigin by Zoho','crm','A CRM for very small businesses',
      ['Pipelines without CRM complexity','Very low price','Mobile app that works well','Built-in telephony','Upgrade path to Zoho CRM'],
      'A health-only plan to start, with add-ons when you need them.','r','plans'],

    ['klaviyo','Klaviyo','mkt','Email and SMS for online stores',
      ['Deep store data for segments','Revenue shown per email','Flows for abandoned carts and win-backs','Strong Shopify integration','Predictive analytics'],
      'Rules with waits act like flows: something happens, wait, then follow up.','r','flow'],
    ['mailchimp','Mailchimp','mkt','Email marketing everyone has heard of',
      ['Easy drag-and-drop emails','Big template library','Free plan for small lists','Basic automations','Familiar to most teams'],
      'Templates you add in one tap, then edit.','r','flow'],
    ['brevo','Brevo','mkt','Email, SMS and WhatsApp priced by sends',
      ['Pay for messages, not contacts','Email, SMS, WhatsApp in one','Transactional email too','Good for growing lists','Marketing automation built in'],
      'Pay for what you use: health first, add Training or Work OS when you want them.','r','plans'],
    ['beehiiv','beehiiv','mkt','Newsletters that make money',
      ['Built for newsletter growth','Ad network and paid subscriptions','Referral programme built in','Clean writing experience','Strong analytics'],
      'Maya reads the comments and tells you what people want next.','r','maya'],
    ['kajabi','Kajabi','mkt','All-in-one for creators selling courses',
      ['Courses, community and payments together','Email marketing included','Funnels and landing pages','No tech stitching','Good for coaches'],
      'Content, posting and comment insights all in one place.','r','maya'],
    ['typefully','Typefully','mkt','Writing and scheduling posts for X and LinkedIn',
      ['Distraction-free writing','Schedule threads and posts','Analytics on what worked','AI help with hooks','Team review before posting'],
      'Send to Maya: she writes the caption, you approve, she posts at the time you pick.','r','maya'],
    ['orshot','Orshot','mkt','Generating marketing images from templates',
      ['Templates filled by API','Consistent branded visuals at scale','Works with automation tools','Fast rendering','No designer needed for variants'],
      'One video, cut for each platform’s shape in the Studio.','t','maya'],
    ['supermetrics','Supermetrics','mkt','Pulling marketing data into reports',
      ['100+ marketing sources','Into Sheets, Looker Studio or a warehouse','Scheduled refreshes','Saves hours of copy-paste','Trusted by agencies'],
      'Post numbers are pulled back onto each post on a timer.','r','maya'],
    ['pushwoosh','Pushwoosh','mkt','Push notifications and journeys',
      ['Push, in-app and email together','Customer journey builder','Segments from app events','A/B testing','Good for mobile apps'],
      'Notifications from your AI team and rules, with your permission.','r','inbox'],
    ['bird','Bird','mkt','Messaging on every channel at low cost',
      ['SMS, WhatsApp, email in one API','Lower prices than many rivals','Global reach','Inbox for conversations','Flows for automated replies'],
      'Your team reports back where you are: in Kova, and as a notification.','r','inbox'],

    ['extend','Extend','data','Turning messy documents into clean data',
      ['High accuracy on complex documents','Handles formats OCR tools miss','Human review only where it is needed','Low-code setup for non-developers','Live in weeks, not months'],
      'Lab reports read into numbers in Labs; you check before they are saved.','v','team'],
    ['weld','Weld','data','Data pipelines and syncing in one place',
      ['ELT, modelling and reverse ETL together','Easy for people light on SQL','Many sources, including Sheets and APIs','Flat, predictable price','Sends data back into business tools'],
      'Readings from your watch and phone land in one place and feed the plan.','r','cmd'],
    ['amperity','Amperity','data','Knowing that many records are one customer',
      ['Identity resolution across messy records','Used by 400+ brands','Customer data ready for marketing','AI agent turns questions into segments','Usage-based pricing'],
      'The AI team answers questions about your own data in plain words.','v','team'],
    ['dbt','dbt','data','Data transformation as code',
      ['SQL models with version control','Tests on your data','Docs and lineage generated','Huge community','Works with every warehouse'],
      'Every feature in Kova ships with a test that proves it works.','r','flow'],
    ['paperoffice','PaperOffice','data','Filing and finding documents with AI',
      ['Scans and sorts documents','Search inside every file','Archive that meets German rules','Works offline','One-time licence option'],
      'Files and folders in the Work OS, searchable from the search bar.','t','cmd'],
    ['cognito','Cognito Forms','data','Powerful forms at a low price',
      ['Calculations and conditional logic','Take payments in forms','Repeating sections','Workflows after submit','Cheap compared with rivals'],
      'Rules with conditions: only continue if it is what you care about.','r','flow'],
    ['docusign','Docusign','data','The standard for e-signatures',
      ['Legally accepted almost everywhere','Templates for repeat agreements','Signing order and reminders','Audit trail on every envelope','Integrates with CRMs'],
      'Anything that leaves Kova waits for your OK, and the log shows who approved it.','r','team'],
    ['firecrawl','Firecrawl','data','Turning websites into clean text for AI',
      ['Clean markdown from any page','Crawls whole sites','Handles JavaScript pages','Simple API','Made for AI apps'],
      'Ravi reads any link you send and comes back with what it says.','r','team'],
    ['tinyfish','TinyFish','data','AI web agents at scale',
      ['Agents that browse and act on sites','Built for many sites at once','Handles logins and forms','Structured results','Enterprise grade'],
      'Your team researches the web on a timer and tells you at the time you ask.','t','team'],
    ['latchbio','LatchBio','data','Bioinformatics without the infrastructure',
      ['No-code interfaces over scientific pipelines','Runs AlphaFold, RNA-seq and more in a browser','Serverless storage and compute','Versioned, reproducible workflows','Scientists and engineers in one place'],
      'Health numbers are explained in plain words, next to the science.','v','team'],

    ['slack','Slack','talk','Team chat with searchable history',
      ['Channels by topic','Search all past messages','Thousands of integrations','Huddles for quick calls','Workflow builder'],
      'Talk to your AI team in one box; @name sends it to that teammate.','r','team'],
    ['calendly','Calendly','talk','Booking meetings without the back-and-forth',
      ['Share a link, they pick a time','Checks your calendars for clashes','Reminders cut no-shows','Routing to the right person','Buffers between meetings'],
      'Before every call your team preps you: who, what to raise, what to bring.','r','prep'],
    ['fireflies','Fireflies','talk','Notes and action items from every call',
      ['Records and transcribes calls','Pulls out action items','Search across all your calls','Pushes notes to the CRM','Topic and sentiment tracking'],
      'Pull action items from a call’s notes: owner, due date, and the decisions kept apart.','r','actions']
  ];
  var L=D.map(function(x){ return {id:x[0],n:x[1],g:x[2],grp:G[x[2]],best:x[3],why:x[4],take:x[5],ev:x[6],go:x[7]}; });
  var EV={r:'From user reviews and independent write-ups',v:'Mostly the company’s own claims',t:'Little public information yet'};

  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function all(){ return L.slice(); }
  function get(id){ return L.filter(function(a){ return a.id===id; })[0]||null; }
  /* the best few apps for something, by the words in it */
  var STOP={the:1,a:1,an:1,and:1,or:1,for:1,to:1,of:1,in:1,on:1,my:1,me:1,i:1,is:1,best:1,tool:1,tools:1,app:1,apps:1,what:1,which:1,with:1,do:1,should:1,use:1};
  function words(t){ return String(t||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(function(w){ return w.length>1&&!STOP[w]; }); }
  function recommend(q,n){
    var qw=words(q); if(!qw.length) return [];
    var sc=L.map(function(a){
      var name=a.n.toLowerCase(), hay=(a.grp+' '+a.best+' '+a.why.join(' ')+' '+a.take).toLowerCase(), s=0;
      qw.forEach(function(w){
        if(name===w||name.split(/[ .()]/).indexOf(w)>=0) s+=10;
        if(a.best.toLowerCase().indexOf(w)>=0) s+=3;
        if(a.grp.toLowerCase().indexOf(w)>=0) s+=2;
        if(hay.indexOf(w)>=0) s+=1;
      });
      if(a.ev==='r') s+=.2;
      return {a:a,s:s};
    }).filter(function(x){ return x.s>=2; }).sort(function(x,y){ return y.s-x.s; });
    return sc.slice(0,n||3).map(function(x){ return x.a; });
  }

  /* the pop-up: groups with a count, each app a row with a little arrow;
     open it for the five reasons, what Kova took, and a button to try it */
  var S={open:{},q:''};
  function open(id){
    if(!window.openSheet) return;
    S.q=''; S.open={};
    if(id){ var a=get(id); if(a){ S.open[a.id]=1; S.g=a.g; } }
    openSheet('<div class="grab"></div><div class="kap" id="kapRoot"></div>');
    draw();
    if(id) setTimeout(function(){ var r=document.querySelector('[data-app="'+id+'"]'); if(r&&r.scrollIntoView) r.scrollIntoView({block:'center'}); },60);
  }
  function row(a){
    var on=!!S.open[a.id];
    return '<div class="kap-app'+(on?' on':'')+'" data-app="'+a.id+'">'
      +'<button class="kap-hd" data-ap="tog" data-v="'+a.id+'" aria-expanded="'+on+'"><span><b>'+esc(a.n)+'</b><small>'+esc(a.best)+'</small></span><i aria-hidden="true">⌄</i></button>'
      +(on?'<div class="kap-bd"><ol>'+a.why.map(function(w){ return '<li>'+esc(w)+'</li>'; }).join('')+'</ol>'
        +'<div class="kap-take"><span>What Kova took</span>'+esc(a.take)+'</div>'
        +'<div class="kap-ev">'+esc(EV[a.ev])+'</div>'
        +(a.go&&GO[a.go]?'<button class="kap-go" data-ap="go" data-v="'+a.go+'">'+esc(GO[a.go])+' ↗</button>':'')+'</div>':'')
      +'</div>';
  }
  function draw(){
    var el=document.getElementById('kapRoot'); if(!el) return;
    var q=S.q.trim().toLowerCase();
    var list=q?L.filter(function(a){ return (a.n+' '+a.grp+' '+a.best+' '+a.why.join(' ')+' '+a.take).toLowerCase().indexOf(q)>=0; }):L;
    var h='<div class="kap-title">How the best tools do it</div>'
      +'<div class="kap-sub">'+L.length+' apps from the automation and workflow shelves, what each is best at, and what Kova does because of it.</div>'
      +'<input class="kap-q" id="kapQ" type="search" placeholder="Search apps or a need, like “follow-ups”" value="'+esc(S.q)+'" autocomplete="off">';
    if(q){
      h+=list.length?list.map(row).join(''):'<div class="kap-sub">Nothing matches “'+esc(S.q)+'”.</div>';
    }else Object.keys(G).forEach(function(k){
      var g=L.filter(function(a){ return a.g===k; }), on=S.g===k;
      h+='<div class="kap-grp'+(on?' on':'')+'"><button class="kap-gh" data-ap="grp" data-v="'+k+'" aria-expanded="'+on+'"><span>'+esc(G[k])+'</span><em>'+g.length+'</em><i aria-hidden="true">⌄</i></button>'
        +(on?'<div class="kap-gb">'+g.map(row).join('')+'</div>':'')+'</div>';
    });
    el.innerHTML=h;
    var qi=document.getElementById('kapQ');
    qi.oninput=function(){ S.q=qi.value; var p=qi.selectionStart; draw(); var n=document.getElementById('kapQ'); n.focus(); try{ n.setSelectionRange(p,p); }catch(e){} };
    el.onclick=function(e){
      var b=e.target.closest('[data-ap]'); if(!b) return;
      var v=b.dataset.v;
      if(b.dataset.ap==='grp'){ S.g=S.g===v?'':v; draw(); }
      else if(b.dataset.ap==='tog'){ S.open[v]=!S.open[v]; draw(); }
      else if(b.dataset.ap==='go') go2(v);
    };
  }
  function go2(k){
    if(window.closeSheet) closeSheet();
    var nav=function(id){ if(window.go) try{ go(id); }catch(e){} };
    setTimeout(function(){
      if(k==='flow'){ nav('workauto'); if(window.KovaFlow) KovaFlow.builder({trigger:'meeting_ended',tcfg:{},filters:[],steps:[{a:'create_task',cfg:{name:'Write up {name}',due:'today'}}]}); }
      else if(k==='cmd'){ if(window.KovaCmd) KovaCmd.open(); }
      else if(k==='actions'||k==='prep') nav('workmeetings');
      else if(k==='team'||k==='maya') nav('workteam');
      else if(k==='inbox') nav('workauto');
      else if(k==='plans'){ if(window.KovaBilling&&KovaBilling.paywall) KovaBilling.paywall(); }
    },220);
  }

  return {all:all,get:get,recommend:recommend,open:open,GROUPS:G,EV:EV,GO:GO,_S:S};
})();
