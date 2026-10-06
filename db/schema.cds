namespace aicorefin;

using { cuid, managed } from '@sap/cds/common';

// ── Lookup / Reference Tables ─────────────────────────────────────────────────

entity AlertLevels : cuid {
    name        : String(20)  @title: 'Alert Level';
    severity    : Integer     @title: 'Severity';  // 1=INFO, 2=WARNING, 3=ALERT
    color       : String(20)  @title: 'Color Code';
}

entity NotificationChannels : cuid {
    name        : String(20)  @title: 'Channel Name';  // SMTP, ANS, API
}

// ── CMS Hierarchy (synced from SAP Cloud Management Service) ──────────────────

/**
 * BTP directory structure synced from Cloud Management Service.
 * Level 1 directories (direct children of the Global Account) → BusinessUnit
 * Level 2 directories (children of Level 1)                    → Application
 */
entity CMSDirectories {
    key guid        : String(100)   @title: 'Directory GUID';
        displayName : String(200)   @title: 'Directory Name';
        description : String(500)   @title: 'Directory Description';
        parentGuid  : String(100)   @title: 'Parent GUID';
        level       : String(20)    @title: 'Level';  // 'BusinessUnit' (L1) or 'Application' (L2)
        lastSynced  : Date          @title: 'Last Synced';
}

/**
 * Mapping of which subaccounts belong to which directory (including nested).
 */
entity CMSDirectorySubaccounts {
    key directoryGuid   : String(100)   @title: 'Directory GUID';
    key subaccountGuid  : String(100)   @title: 'Subaccount GUID';
}

// ── Subaccount Master ─────────────────────────────────────────────────────────

/**
 * Master list of subaccounts (the discovered universe).
 * Populated from CMS (discoveredViaCms = true) or added manually.
 * `isMonitored` reflects whether an active MonitoringConfig exists for it.
 */
entity Subaccounts : managed {
    key subaccountId        : String(100)   @title: 'Subaccount ID';  // BTP subaccount GUID
    subaccountName          : String(200)   @title: 'Subaccount Name';
    region                  : String(20)    @title: 'Region';
    parentDirectoryGuid     : String(100)   @title: 'Parent Directory GUID';
    businessUnitGuid        : String(100)   @title: 'Business Unit GUID';
    discoveredViaCms        : Boolean       @title: 'Discovered via CMS';
    isMonitored             : Boolean       @title: 'Monitored';
}

// ── Configuration Entities ────────────────────────────────────────────────────

/**
 * Each record represents one subaccount to monitor.
 * Multiple records can be active simultaneously (multi-subaccount support).
 */
entity MonitoringConfigs : cuid, managed {
    subaccountId            : String(100)   @title: 'Subaccount ID';
    subaccountName          : String(200)   @title: 'Subaccount Name';
    subaccount              : Association to Subaccounts on subaccount.subaccountId = subaccountId;
    spendingLimit           : Decimal(15,2) @title: 'Monthly Spending Limit (CU)';
    warningThresholdPct     : Decimal(5,2)  @title: 'Warning Threshold (%)';
    alertThresholdPct       : Decimal(5,2)  @title: 'Alert Threshold (%)';
    checkTimeUtc            : String(5)     @title: 'Daily Check Time (UTC)';
    receiveDailyEmails      : Boolean       @title: 'Receive Daily Update Emails';
    isActive                : Boolean       @title: 'Active';
    displayOrder            : Integer       @title: 'Display Order';
    tags                    : String(500)   @title: 'Tags (comma-separated)';
}

/**
 * Shared notification configuration (one for all subaccounts).
 * Supports dual transport: SMTP (nodemailer) and REST API (SendGrid/Mailgun/custom).
 *
 * ANS credentials are NOT stored here — they come from the CF service binding
 * (alert-notification service bound via MTA). Only the toggle and binding name
 * are stored so the app knows whether ANS is enabled and which binding to use.
 */
entity NotificationConfigs : cuid, managed {
    // ── Transport selection ──────────────────────────────────────────────────
    transportType           : String(10)    @title: 'Transport Type';  // 'SMTP' or 'API'

    // ── SMTP transport settings ──────────────────────────────────────────────
    enableSmtp              : Boolean       @title: 'Enable SMTP';
    smtpHost                : String(200)   @title: 'SMTP Host';
    smtpPort                : Integer       @title: 'SMTP Port';
    smtpUser                : String(200)   @title: 'SMTP User';
    smtpPassword            : String(500)   @title: 'SMTP Password';
    smtpFrom                : String(200)   @title: 'SMTP From Address';
    smtpUseTls              : Boolean       @title: 'Use TLS';
    senderName              : String(100)   @title: 'Sender Display Name';
    notificationEmails      : String(1000)  @title: 'Recipient Emails (comma-separated)';

    // ── API transport settings (SendGrid/Mailgun/custom) ─────────────────────
    apiEndpoint             : String(500)   @title: 'API Endpoint URL';
    apiKey                  : String(500)   @title: 'API Key (encrypted)';
    apiAuthType             : String(20)    @title: 'API Auth Type';   // 'Bearer', 'Basic', 'Custom'
    apiCustomHeader         : String(100)   @title: 'Custom Auth Header Name';

    // ── SAP Alert Notification Service ───────────────────────────────────────
    enableAns               : Boolean       @title: 'Enable ANS';
    ansServiceName          : String(100)   @title: 'ANS Service Binding Name';
}

// ── Technical Consumption Data (from subaccountUsage API - daily) ──────────────

entity ConsumptionRecords : cuid, managed {
    recordDate              : Date          @title: 'Record Date';
    reportYearMonth         : String(6)     @title: 'Report Year-Month';  // e.g. "202601"
    subaccountId            : String(100)   @title: 'Subaccount ID';
    subaccountName          : String(200)   @title: 'Subaccount Name';
    subaccount              : Association to Subaccounts on subaccount.subaccountId = subaccountId;
    totalCapacityUnits      : Decimal(20,6) @title: 'Total Capacity Units';
    spendingLimit           : Decimal(15,2) @title: 'Spending Limit at Time';
    percentageUsed          : Decimal(7,2)  @title: 'Percentage Used (%)';
    projectedCu             : Decimal(20,6) @title: 'Projected Month-End CU';
    daysElapsed             : Integer       @title: 'Days Elapsed';
    daysInMonth             : Integer       @title: 'Days in Month';
    interval                : String(10)    @title: 'Interval';  // 'daily' = provisional/till-date, 'monthly' = finalized
    alertLevel              : Association to AlertLevels @title: 'Alert Level';
    notificationSent        : Boolean       @title: 'Notification Sent';
    modelUsages             : Composition of many ModelUsages on modelUsages.consumptionRecord = $self;
}

entity ModelUsages : cuid {
    consumptionRecord       : Association to ConsumptionRecords @title: 'Consumption Record';
    modelName               : String(200)   @title: 'Model / Application Name';
    capacityUnits           : Decimal(20,6) @title: 'Total Capacity Units';
    inferenceCu             : Decimal(20,6) @title: 'Inference CU';
    groundingCu             : Decimal(20,6) @title: 'Grounding CU';
    genaiTokenCu            : Decimal(20,6) @title: 'GenAI Token CU';
    dataIndexedCu           : Decimal(20,6) @title: 'Data Indexed CU';
    inputTokens             : Decimal(20,0) @title: 'Input Tokens';
    outputTokens            : Decimal(20,0) @title: 'Output Tokens';
    totalTokens             : Decimal(20,0) @title: 'Total Tokens';
    sharePercentage         : Decimal(7,2)  @title: 'Share (%)';
}

// ── Commercial Data (from monthlySubaccountsCost API - monthly) ───────────────

/**
 * Stores commercial/billing data from the monthlySubaccountsCost endpoint.
 * Monthly granularity — one record per service+measure per month.
 */
entity CommercialMeasures : cuid, managed {
    reportYearMonth         : String(6)     @title: 'Report Year-Month';  // e.g. "202601"
    subaccountId            : String(100)   @title: 'Subaccount ID';
    subaccountName          : String(200)   @title: 'Subaccount Name';
    subaccount              : Association to Subaccounts on subaccount.subaccountId = subaccountId;
    serviceId               : String(100)   @title: 'Service ID';         // "ai-core"
    serviceName             : String(200)   @title: 'Service Name';       // "AI Core"
    plan                    : String(100)   @title: 'Plan';               // "extended"
    planName                : String(200)   @title: 'Plan Name';          // "Extended"
    measureId               : String(100)   @title: 'Measure ID';         // "capacity_units"
    metricName              : String(200)   @title: 'Metric Name';        // "Capacity Unit"
    usage                   : Decimal(20,6) @title: 'Usage';
    actualUsage             : Decimal(20,6) @title: 'Actual Usage';
    chargedBlocks           : Decimal(20,6) @title: 'Charged Blocks';
    cost                    : Decimal(15,4) @title: 'Cost';
    currency                : String(3)     @title: 'Currency';           // "EUR", "USD"
    paygCost                : Decimal(15,4) @title: 'PAYG Cost';
    cloudCreditsCost        : Decimal(15,4) @title: 'Cloud Credits Cost';
    unit                    : String(50)    @title: 'Unit';
}

// ── Alert / Notification Log ──────────────────────────────────────────────────

entity AlertLogs : cuid, managed {
    alertTimestamp          : Timestamp     @title: 'Alert Timestamp';
    alertLevel              : Association to AlertLevels @title: 'Alert Level';
    subaccountId            : String(100)   @title: 'Subaccount ID';
    subaccountName          : String(200)   @title: 'Subaccount Name';
    subaccount              : Association to Subaccounts on subaccount.subaccountId = subaccountId;
    totalCu                 : Decimal(20,6) @title: 'Total CU at Alert Time';
    percentageUsed          : Decimal(7,2)  @title: 'Percentage Used (%)';
    spendingLimit           : Decimal(15,2) @title: 'Spending Limit';
    message                 : String(2000)  @title: 'Alert Message';
    smtpSent                : Boolean       @title: 'SMTP Sent';
    ansSent                 : Boolean       @title: 'ANS Sent';
    recipients              : String(1000)  @title: 'Recipients';
}