using { aicorefin as db } from '../db/schema';

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │ Role-based access is ENABLED in v2.                                          │
// │  - Admin : full read/write access, can manage configs and trigger actions    │
// │  - Viewer: read-only access to consumption data, alerts, hierarchy           │
// │  - system-user: allows Job Scheduler / service-to-service calls              │
// │                                                                              │
// │ Role collections in BTP Cockpit:                                             │
// │   AICore_FinOps_Admin  → Admin role template (xs-security.json)              │
// │   AICore_FinOps_Viewer → Viewer role template (xs-security.json)             │
// └─────────────────────────────────────────────────────────────────────────────┘

@requires: ['Viewer', 'Admin', 'system-user']
service FinOpsService @(path: '/service/FinOpsService') {

    // ── Configuration ─────────────────────────────────────────────────────────
    @requires: 'Admin'
    entity MonitoringConfigs    as projection on db.MonitoringConfigs;

    @requires: 'Admin'
    entity NotificationConfigs  as projection on db.NotificationConfigs;

    // ── Consumption Data ──────────────────────────────────────────────────────
    @readonly
    entity ConsumptionRecords   as projection on db.ConsumptionRecords;

    @readonly
    entity ModelUsages          as projection on db.ModelUsages;

    @readonly
    entity CommercialMeasures   as projection on db.CommercialMeasures;

    // ── Alert History ─────────────────────────────────────────────────────────
    @readonly
    entity AlertLogs            as projection on db.AlertLogs;

    // ── Lookup / Reference (read-only) ────────────────────────────────────────
    @readonly
    entity AlertLevels          as projection on db.AlertLevels;

    @readonly
    entity NotificationChannels as projection on db.NotificationChannels;

    // ── Subaccount Master + CMS Hierarchy ─────────────────────────────────────
    // @requires: 'Admin'
    entity SubaccountMaster     as projection on db.Subaccounts;

    @readonly
    entity CMSDirectorySubaccounts as projection on db.CMSDirectorySubaccounts;

    // CMS-sourced Business Units (Level 1 directories)
    @readonly
    entity CMSBusinessUnits as select
        key guid as ID,
            case when description is not null and description <> ''
                then displayName || ' - ' || description
                else displayName
            end as name : String,
            displayName as shortName : String
        from db.CMSDirectories where level = 'BusinessUnit';

    // CMS-sourced Applications (Level 2 directories)
    @readonly
    entity CMSApplications as select
        key guid as ID,
            case when description is not null and description <> ''
                then displayName || ' - ' || description
                else displayName
            end as name : String,
            displayName as shortName : String,
            parentGuid as businessUnitId : String
        from db.CMSDirectories where level = 'Application';

    // ── Read-only view of monitored subaccount list ──────────────────────────
    @readonly
    entity Subaccounts          as select from db.MonitoringConfigs {
        key ID,
        subaccountId,
        subaccountName,
        spendingLimit,
        warningThresholdPct,
        alertThresholdPct,
        isActive,
        displayOrder,
        tags
    } where isActive = true order by displayOrder asc;

    // ── Actions ───────────────────────────────────────────────────────────────

    // Trigger a monitoring check immediately
    // If subaccountId is null, checks ALL active subaccounts
    @requires: 'Admin'
    action triggerCheck(dryRun: Boolean, subaccountId: String) returns {
        status          : String;
        results         : array of {
            subaccountId    : String;
            subaccountName  : String;
            alertLevel      : String;
            totalCu         : Decimal(20,6);
            percentageUsed  : Decimal(7,2);
            projectedCu     : Decimal(20,6);
            message         : String;
        };
        totalChecked    : Integer;
        message         : String;
    };

    // Send a test notification
    @requires: 'Admin'
    action testNotification() returns {
        smtpResult      : Boolean;
        ansResult       : Boolean;
        message         : String;
    };

    // Send a test email to verify email configuration (SMTP or API)
    @requires: 'Admin'
    action sendTestEmail(recipientEmail: String) returns {
        success         : Boolean;
        message         : String;
    };

    // Load historical data from UAS API for a date range
    // Fetches all AI Core measures (capacity_units + tokens) and stores daily records
    @requires: 'Admin'
    action loadHistoricalData(fromDate: String, toDate: String, subaccountId: String) returns {
        status          : String;
        recordsLoaded   : Integer;
        daysProcessed   : Integer;
        message         : String;
    };

    // ── Functions ─────────────────────────────────────────────────────────────

    // Force a re-sync of the CMS directory structure (clears the daily guard)
    @requires: 'Admin'
    action refreshCMSDirectories() returns {
        status          : String;
        message         : String;
    };

    // Opt a discovered subaccount into monitoring (creates/activates a MonitoringConfig)
    @requires: 'Admin'
    action enableMonitoring(
        subaccountId        : String,
        spendingLimit       : Decimal(15,2),
        warningThresholdPct : Decimal(5,2),
        alertThresholdPct   : Decimal(5,2)
    ) returns {
        status          : String;
        configId        : String;
        message         : String;
    };

    // Per-model breakdown for a month: CU split by type, tokens, cost, cost-per-1K-tokens
    function modelBreakdown(reportYearMonth: String, subaccountId: String) returns array of {
        modelName           : String;
        capacityUnits       : Decimal(20,6);
        inferenceCu         : Decimal(20,6);
        groundingCu         : Decimal(20,6);
        genaiTokenCu        : Decimal(20,6);
        dataIndexedCu       : Decimal(20,6);
        inputTokens         : Decimal(20,0);
        outputTokens        : Decimal(20,0);
        totalTokens         : Decimal(20,0);
        sharePercentage     : Decimal(7,2);
        cost                : Decimal(15,4);
        currency            : String;
        costPer1kTokens     : Decimal(15,6);
    };

    // Top models ranked by cost across a year
    function topModelsByCost(year: Integer, subaccountId: String, top: Integer) returns array of {
        modelName           : String;
        totalCost           : Decimal(15,4);
        totalCu             : Decimal(20,6);
        totalTokens         : Decimal(20,0);
        currency            : String;
    };

    // Monthly stacked CU by type (Inference / Grounding / GenAI Token / Data Indexed)
    function cuTypeTrend(year: Integer, subaccountId: String) returns array of {
        month               : String;
        reportYearMonth     : String;
        inferenceCu         : Decimal(20,6);
        groundingCu         : Decimal(20,6);
        genaiTokenCu        : Decimal(20,6);
        dataIndexedCu       : Decimal(20,6);
        totalCu             : Decimal(20,6);
    };

    // Get overview status for ALL active subaccounts (for global dashboard)
    function overviewStatus() returns array of {
        subaccountId        : String;
        subaccountName      : String;
        totalCu             : Decimal(20,6);
        spendingLimit       : Decimal(15,2);
        percentageUsed      : Decimal(7,2);
        projectedCu         : Decimal(20,6);
        alertLevel          : String;
        daysElapsed         : Integer;
        daysInMonth         : Integer;
        lastCheckDate       : String;
        tags                : String;
    };

    // Get current consumption status for a specific subaccount
    function currentStatus(subaccountId: String) returns {
        subaccountId        : String;
        subaccountName      : String;
        totalCu             : Decimal(20,6);
        spendingLimit       : Decimal(15,2);
        percentageUsed      : Decimal(7,2);
        projectedCu         : Decimal(20,6);
        alertLevel          : String;
        daysElapsed         : Integer;
        daysInMonth         : Integer;
        lastCheckDate       : String;
        topModels           : array of {
            modelName       : String;
            capacityUnits   : Decimal(20,6);
            sharePercentage : Decimal(7,2);
        };
    };

    // Get monthly aggregated consumption for a subaccount
    function monthlyStats(year: Integer, subaccountId: String) returns array of {
        month               : String;
        reportYearMonth     : String;
        totalCu             : Decimal(20,6);
        projectedCu         : Decimal(20,6);
        spendingLimit       : Decimal(15,2);
        percentageUsed      : Decimal(7,2);
    };

    // Get daily consumption for a given month and subaccount
    function dailyStats(reportYearMonth: String, subaccountId: String) returns array of {
        recordDate          : String;
        totalCu             : Decimal(20,6);
        percentageUsed      : Decimal(7,2);
        projectedCu         : Decimal(20,6);
        alertLevel          : String;
        modelCount          : Integer;
    };

    // User info function (kept for future role-based UI rendering)
    function userInfo() returns {
        user       : String;
        roles      : array of String;
    };
}