using { aicorefin as db } from '../db/schema';

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │ Role-based access is DISABLED for now. To re-enable in the future:          │
// │   1. Uncomment @requires annotations below                                  │
// │   2. Set auth.kind to "xsuaa" in package.json [production] profile          │
// │   3. Assign role collections to users in BTP Cockpit                        │
// └─────────────────────────────────────────────────────────────────────────────┘

// @requires: ['Viewer', 'Admin', 'system-user']
service FinOpsService @(path: '/service/FinOpsService') {

    // ── Configuration ─────────────────────────────────────────────────────────
    // @requires: 'Admin'
    entity MonitoringConfigs    as projection on db.MonitoringConfigs;

    // @requires: 'Admin'
    entity NotificationConfigs  as projection on db.NotificationConfigs;

    // ── Consumption Data ──────────────────────────────────────────────────────
    @readonly
    entity ConsumptionRecords   as projection on db.ConsumptionRecords;

    @readonly
    entity ModelUsages          as projection on db.ModelUsages;

    @readonly
    entity UsageMetrics         as projection on db.UsageMetrics;

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

    // ── Read-only view of subaccount list ─────────────────────────────────────
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
    // @requires: 'Admin'
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
    // @requires: 'Admin'
    action testNotification() returns {
        smtpResult      : Boolean;
        ansResult       : Boolean;
        message         : String;
    };


    // Send a test email to verify email configuration (SMTP or API)
    // @requires: 'Admin'
    action sendTestEmail(recipientEmail: String) returns {
        success         : Boolean;
        message         : String;
    };
    // Load historical data from UAS API for a date range
    // Fetches all AI Core measures (capacity_units + tokens) and stores daily records
    // @requires: 'Admin'
    action loadHistoricalData(fromDate: String, toDate: String, subaccountId: String) returns {
        status          : String;
        recordsLoaded   : Integer;
        daysProcessed   : Integer;
        message         : String;
    };

    // ── Functions ─────────────────────────────────────────────────────────────

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