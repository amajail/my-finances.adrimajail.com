/**
 * Azure Functions entry point
 * Requires all function definitions to register them with the runtime
 */

require('./brokers');
require('./positions');
require('./positionDetail');
require('./portfolioSummary');
require('./settings');
require('./refreshPrices');
require('./refreshPricesTimer');
require('./weeklyAnalysisTimer');
require('./getWeeklyAnalysisList');
require('./getWeeklyAnalysis');
