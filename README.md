# SAP BTP AI Core Consumption Monitor

[![REUSE status](https://api.reuse.software/badge/github.com/SAP-samples/btp-ai-core-consumption-monitor)](https://api.reuse.software/info/github.com/SAP-samples/btp-ai-core-consumption-monitor)

> **Disclaimer:** This tool is provided as-is and is not covered by SAP Support. This is not a replacement of the official billing documents you receive from SAP. The information provided by this tool is purely indicative. SAP does not guarantee the accuracy of the data displayed.

## Description

This application monitors and visualizes **SAP AI Core capacity unit (CU) consumption** across multiple BTP subaccounts. It fetches data from the SAP BTP Usage and Accounting Service (UAS) APIs and provides a **Technical View** (CU per model, tokens), a **Commercial View** (billing costs), and an **AI Breakdown View** (cost per token, CU by type) of AI Core usage — across a full BTP account hierarchy when the optional Cloud Management Service integration is enabled.

The application helps FinOps teams and platform administrators to:

- Discover BTP subaccounts automatically via the Cloud Management Service (CMS) hierarchy, or manage them manually
- Track AI Core spending against monthly budgets with per-subaccount alerts
- Identify which models consume the most capacity units and at what cost per token
- Get notified when consumption approaches configured thresholds (SMTP email or SAP ANS)
- View historical consumption trends month over month with Recharts visualizations
- Navigate the account hierarchy — Business Unit → Application → Subaccount — from the header

![Dashboard Overview](ScreenShot/OverView.png)

![Detail View](ScreenShot/Detailed%20View.png)

## Architecture

![Architecture Diagram](ScreenShot/Architecture%20AI%20Consumption%20Monitor.png)

| Layer | Technology |
|-------|-----------|
| Backend | SAP Cloud Application Programming Model (CAP) — Node.js |
| Database | SAP HANA Cloud (HDI Container) |
| Frontend | React 18, Vite, Tailwind CSS, Recharts, Lucide Icons |
| Authentication | SAP XSUAA |
| Data Source | BTP Usage & Accounting Service (UAS) APIs |
| Account Discovery | SAP Cloud Management Service (CMS) — optional |
| Notifications | SMTP (Nodemailer), HTTP API endpoint, SAP Alert Notification Service |

## Requirements

### SAP BTP Services

| Service | Plan | Required |
|---------|------|----------|
| SAP HANA Cloud | hdi-shared | ✅ Yes |
| XSUAA | application | ✅ Yes |
| UAS (Usage & Accounting) | reporting-ga-admin | ✅ Yes |
| Destination Service | lite | ✅ Yes |
| HTML5 Application Repository | app-host | ✅ Yes |
| Job Scheduling Service | standard | ❌ Optional (Recommended) |
| Alert Notification Service | standard | ❌ Optional |
| Cloud Management Service (CIS) | central-viewer | ❌ Optional |

### Development Tools

- Node.js >= 20
- SAP Cloud Application Programming Model (CAP) — `@sap/cds-dk`
- Cloud Foundry CLI (`cf`)
- MBT Build Tool (`mbt`) — for MTA builds
- SAP BTP Cloud Foundry environment with HANA Cloud

## Download and Installation

### 1. Clone

```bash
git clone https://github.com/SAP-samples/btp-ai-core-consumption-monitor.git
cd btp-ai-core-consumption-monitor
```

### 2. Install Dependencies

```bash
npm install
cd app/dashboard && npm install && cd ../..
```

### 3. Build & Deploy

The project uses scripts defined in `package.json`. Execute them with `npm run <script>`:

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `npm run build` | Build the MTA archive (`ai-core-finops.mtar`) |
| `deploy` | `npm run deploy` | Deploy the MTA archive to Cloud Foundry |
| `undeploy` | `npm run undeploy` | Remove all deployed apps and services |

```bash
# Build MTA archive
npm run build

# Deploy to Cloud Foundry
npm run deploy

# Undeploy (removes all services)
npm run undeploy
```

## Configuration

### Without CMS (Manual Mode)

After deployment, subaccounts are managed manually:

1. Open the application and navigate to **Configuration**
2. Under **Subaccount Discovery**, click **Add Subaccount Manually**
3. Enter the Subaccount ID (UUID), display name, and monthly spending limit
4. Click **"Run Check"** on the Overview page to fetch current data
5. Click **"Load Historical"** to backfill historical consumption data

### With CMS (Auto-Discovery Mode)

When the Cloud Management Service binding is present (see [CMS Account Discovery](#cms-account-hierarchy-discovery)), the app discovers your BTP account hierarchy automatically:

1. On startup, the app syncs your Global Account hierarchy into the **Subaccounts** master list
2. Navigate to **Configuration → Subaccount Discovery** to see all discovered subaccounts grouped by Business Unit and Application
3. Click **Enable Monitoring** on a subaccount to opt it in and set a spending limit and alert thresholds
4. Use the **Sync from CMS** button to refresh the hierarchy at any time

A subaccount that has not been opted in is visible in the discovery list but will not appear in the monitoring overview or trigger alerts.

## Security – Roles & Authorization

The application defines two role templates in `xs-security.json`:

| Role Collection | Role Template | Access |
|----------------|---------------|--------|
| `AICore_FinOps_Admin` | Admin | Full access — manage configuration, trigger checks, view all data, manage notifications |
| `AICore_FinOps_Viewer` | Viewer | Read-only — view dashboards, monthly data, and alert history |

Role-based authorization is enforced via `@requires` annotations in `srv/service.cds`. Assign the role collections to users or user groups in the BTP Cockpit after deployment.

> In local development (`cds watch`), a dummy auth provider is used — all users are treated as Admin. In production (`[production]` profile in `package.json`), XSUAA is enforced.

## CMS Account Hierarchy Discovery

The optional **Cloud Management Service** (service: `cis`, plan: `central-viewer`) integration lets the app discover your full BTP account hierarchy — Global Account → Business Units (L1 directories) → Applications (L2 directories) → Subaccounts — without any manual data entry.

### Enabling CMS

1. Ensure `cis central-viewer` is entitled in your subaccount (BTP Cockpit → Entitlements)

1. Create the service instance:

   ```bash
   cf create-service cis central-viewer ai-core-finops-cms
   ```

1. In `mta.yaml`, uncomment the CMS resource and its binding:

   ```yaml
   # modules > ai-core-finops-srv > requires:
   - name: ai-core-finops-cms

   # resources:
   - name: ai-core-finops-cms
     type: org.cloudfoundry.managed-service
     parameters:
       service: cis
       service-plan: central-viewer
   ```

1. Rebuild and redeploy.

The app reads the CMS API endpoint and OAuth token URL directly from the service binding (`credentials.endpoints.accounts_service_url` and `credentials.uaa.url`) — no manual region configuration is needed.

### Fallback Behavior

If the CMS service is not bound, the app boots normally and operates in manual mode. The Subaccount Discovery UI will show the **Add Manually** form instead of the hierarchy browser.

## Job Scheduling (Optional but Recommended)

The application can use the **SAP BTP Job Scheduling Service** for automated daily monitoring checks. Without it, use the **"Run Check"** or **"Check All"** buttons in the UI to pull fresh data on demand.

### Enabling Job Scheduler

1. In `mta.yaml`, uncomment the scheduler resource and binding:

```yaml
# modules > ai-core-finops-srv > requires:
- name: ai-core-finops-scheduler

# resources:
- name: ai-core-finops-scheduler
  type: org.cloudfoundry.managed-service
  parameters:
    service: jobscheduler
    service-plan: standard
    config:
      enable-xsuaa-support: true
```

1. Rebuild and redeploy.

The application will automatically register a daily cron job (07:00 UTC) that:

- Fetches current month usage for all active subaccounts (technical + commercial)
- Stores/updates consumption records in HANA
- Sends notifications (email/ANS) if thresholds are breached
- On days 1–3 of a new month, also finalizes the previous month's commercial data

## Notifications

The application supports three notification channels, all configurable from the **Configuration → Notification Settings** section:

| Channel | Description |
|---------|-------------|
| **SMTP Email** | Rich HTML emails with CU breakdown, progress bars, and model details. Supports TLS/STARTTLS. |
| **API Endpoint** | Posts a JSON alert payload to any HTTP endpoint (e.g. a webhook, a custom notification bus). Supports Bearer token and custom header auth. |
| **SAP ANS** | Structured events posted to the SAP Alert Notification Service. |

All channels can be independently enabled/disabled. Use the **Send Test** buttons in the UI to verify connectivity before enabling live alerts.

## Known Issues

- Token data (input/output) is only available for GenAI models (GPT, Claude, etc.) — vector_storage and retrieval_text show "—" for tokens
- Commercial cost data from `monthlySubaccountsCost` may not be immediately available for the current month (SAP processes with a delay)
- The "Projected" metric uses simple linear extrapolation and may not reflect actual month-end usage
- CMS sync discovers only subaccounts that are children of L1 (Business Unit) and L2 (Application) directories; subaccounts placed directly under the Global Account are not picked up

## How to Obtain Support

This is an open-source sample application. **SAP does not provide official support.**

If you encounter issues or have questions:

- 🐛 **Bugs** — Please [create an issue](https://github.com/SAP-samples/btp-ai-core-consumption-monitor/issues) in this repository
- 💡 **Feature Requests** — Open an [issue](https://github.com/SAP-samples/btp-ai-core-consumption-monitor/issues) with the `enhancement` label
- 💬 **Questions** — Use [GitHub Discussions](https://github.com/SAP-samples/btp-ai-core-consumption-monitor/discussions) or open an issue

For additional support, [ask a question in SAP Community](https://answers.sap.com/questions/ask.html).

Please check existing issues before creating new ones.

## Contributing

If you wish to contribute code, offer fixes or improvements, please send a pull request. Due to legal reasons, contributors will be asked to accept a DCO when they create the first pull request to this project. This happens in an automated fashion during the submission process. SAP uses [the standard DCO text of the Linux Foundation](https://developercertificate.org/).

## Code of Conduct

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone. Please read and follow our [Code of Conduct](https://github.com/SAP-samples/.github/blob/main/CODE_OF_CONDUCT.md).

## License

Copyright 2026 SAP SE or an SAP affiliate company and btp-ai-core-consumption-monitor contributors. Please see our [LICENSE](LICENSE) for copyright and license information. Detailed information including third-party components and their licensing/copyright information is available [via the REUSE tool](https://api.reuse.software/info/github.com/SAP-samples/btp-ai-core-consumption-monitor).

---

> **Note:** This application is provided as a sample/reference implementation. It is not intended for production use without proper review, testing, and hardening. SAP does not guarantee the accuracy of the data displayed and recommends verifying against the official BTP Cockpit usage reports.
