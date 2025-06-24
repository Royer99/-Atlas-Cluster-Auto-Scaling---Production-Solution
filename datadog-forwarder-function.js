/**
 * Atlas Log Forwarder Function: Send logs to Datadog
 * 
 * This function receives logs from Atlas App Services Log Forwarder
 * and sends them to Datadog with proper formatting and metadata
 */

exports = async function(logEntry) {
  const axios = require("axios").default;
  
  // Datadog configuration - store as App Services Values
  const DATADOG_API_KEY = context.values.get("DATADOG_API_KEY");
  const DATADOG_SITE = context.values.get("DATADOG_SITE") || "us5.datadoghq.com"; // Updated default for US5
  
  if (!DATADOG_API_KEY) {
    console.error("DATADOG_API_KEY not configured in App Services Values");
    return { success: false, error: "Missing Datadog API key" };
  }
  
  // Log API key info for debugging (first/last 4 chars only)
  const keyPreview = DATADOG_API_KEY.length > 8 ? 
    `${DATADOG_API_KEY.substring(0, 4)}...${DATADOG_API_KEY.substring(DATADOG_API_KEY.length - 4)}` : 
    "****";
  console.log(`Using Datadog API key: ${keyPreview} (length: ${DATADOG_API_KEY.length})`);
  console.log(`Datadog site: ${DATADOG_SITE}`);
  
  const DATADOG_LOGS_URL = `https://http-intake.logs.${DATADOG_SITE}/v1/input/${DATADOG_API_KEY}`;
  console.log(`Datadog URL: https://http-intake.logs.${DATADOG_SITE}/v1/input/[API_KEY]`);
  
  try {
    // Transform Atlas log entry to Datadog format
    const datadogLog = {
      // Datadog required fields
      timestamp: logEntry.timestamp || new Date().toISOString(),
      level: determineLogLevel(logEntry),
      source: "atlas-app-services",
      service: "cluster-auto-scaling",
      
      // Main log message
      message: extractLogMessage(logEntry),
      
      // Atlas-specific metadata
      atlas: {
        app_id: logEntry.app_id,
        function_name: logEntry.function_name,
        execution_id: logEntry.execution_id,
        user_id: logEntry.user_id,
        status: logEntry.status,
        execution_time_ms: logEntry.execution_time_ms
      },
      
      // Business context (from cluster scaling operations)
      cluster_scaling: extractClusterScalingData(logEntry),
      
      // Datadog tags for filtering and dashboards
      tags: buildDatadogTags(logEntry),
      
      // Raw Atlas log for debugging
      raw_atlas_log: logEntry
    };
    
    // Send to Datadog with detailed logging
    console.log("Sending log to Datadog...");
    console.log("Payload preview:", JSON.stringify({
      timestamp: datadogLog.timestamp,
      level: datadogLog.level,
      message: datadogLog.message.substring(0, 100) + "...",
      tags: datadogLog.tags
    }));
    
    const response = await axios.post(DATADOG_LOGS_URL, datadogLog, {
      headers: {
        'Content-Type': 'application/json'
        // Note: API key is in URL, not header for Datadog logs intake
      },
      timeout: 10000
    });
    
    console.log(`Log forwarded to Datadog successfully: ${response.status}`);
    return { 
      success: true, 
      status: response.status,
      datadog_log_id: response.data?.id 
    };
    
  } catch (error) {
    console.error(`Failed to forward log to Datadog: ${error.message}`);
    
    // Log error details for debugging
    if (error.response) {
      console.error(`Datadog API Error: ${error.response.status} - ${error.response.data}`);
    }
    
    return { 
      success: false, 
      error: error.message,
      datadog_response: error.response?.data 
    };
  }
};

// Helper function to determine log level from Atlas log entry
function determineLogLevel(logEntry) {
  // Check various indicators of log severity
  if (logEntry.status === "failed" || logEntry.type === "error") {
    return "ERROR";
  }
  
  if (logEntry.status === "success" || logEntry.type === "function") {
    return "INFO";
  }
  
  // Check log content for error indicators
  const message = (logEntry.message || logEntry.logs || "").toLowerCase();
  if (message.includes("error") || message.includes("failed") || message.includes("exception")) {
    return "ERROR";
  }
  
  if (message.includes("warn") || message.includes("warning")) {
    return "WARN";
  }
  
  return "INFO";
}

// Extract meaningful log message from Atlas log entry
function extractLogMessage(logEntry) {
  // Priority order for finding the main message
  if (logEntry.message) {
    return logEntry.message;
  }
  
  if (logEntry.logs && Array.isArray(logEntry.logs) && logEntry.logs.length > 0) {
    // Combine log entries with newlines
    return logEntry.logs.join('\n');
  }
  
  if (logEntry.logs && typeof logEntry.logs === 'string') {
    return logEntry.logs;
  }
  
  // Fallback to function execution summary
  if (logEntry.function_name && logEntry.status) {
    return `Function ${logEntry.function_name} ${logEntry.status}`;
  }
  
  return "Atlas App Services log entry";
}

// Extract cluster scaling specific data from logs
function extractClusterScalingData(logEntry) {
  const scalingData = {
    is_cluster_operation: false
  };
  
  // Check if this is a cluster scaling operation
  const functionName = logEntry.function_name || "";
  const message = logEntry.message || logEntry.logs || "";
  
  if (functionName.includes("resize") || functionName.includes("cluster") || 
      message.includes("cluster") || message.includes("resize")) {
    
    scalingData.is_cluster_operation = true;
    
    // Extract cluster details from log message
    const clusterMatch = message.match(/cluster[:\s]+(\w+)/i);
    if (clusterMatch) {
      scalingData.cluster_name = clusterMatch[1];
    }
    
    // Extract instance sizes
    const sizeMatch = message.match(/(\w\d+)\s*(?:to|→)\s*(\w\d+)/i);
    if (sizeMatch) {
      scalingData.from_size = sizeMatch[1];
      scalingData.to_size = sizeMatch[2];
    }
    
    // Extract operation status
    if (message.includes("UPDATING")) {
      scalingData.operation_status = "UPDATING";
    } else if (message.includes("completed")) {
      scalingData.operation_status = "COMPLETED";
    } else if (message.includes("failed")) {
      scalingData.operation_status = "FAILED";
    }
  }
  
  return scalingData;
}

// Build comprehensive tags for Datadog filtering and dashboards
function buildDatadogTags(logEntry) {
  const tags = [];
  
  // Environment and service tags
  tags.push("source:atlas-app-services");
  tags.push("service:cluster-auto-scaling");
  
  // Function-specific tags
  if (logEntry.function_name) {
    tags.push(`function:${logEntry.function_name}`);
  }
  
  // Status tags
  if (logEntry.status) {
    tags.push(`status:${logEntry.status}`);
  }
  
  // App ID tag
  if (logEntry.app_id) {
    tags.push(`app_id:${logEntry.app_id}`);
  }
  
  // Extract cluster-specific tags from log content
  const message = logEntry.message || logEntry.logs || "";
  
  // Cluster name tag
  const clusterMatch = message.match(/cluster[:\s]+(\w+)/i);
  if (clusterMatch) {
    tags.push(`cluster:${clusterMatch[1]}`);
  }
  
  // Operation type tag
  if (message.includes("resize")) {
    tags.push("operation:resize");
  }
  
  // Environment tag (try to infer from function name or cluster name)
  if (logEntry.function_name && logEntry.function_name.includes("prod")) {
    tags.push("env:production");
  } else if (logEntry.function_name && logEntry.function_name.includes("staging")) {
    tags.push("env:staging");
  } else if (logEntry.function_name && logEntry.function_name.includes("dev")) {
    tags.push("env:development");
  }
  
  return tags;
}
