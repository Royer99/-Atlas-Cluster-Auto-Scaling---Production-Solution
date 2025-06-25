# Atlas Cluster Auto-Scaling - Production Solution

**Status:** Production ready  
**For:** Scheduled cluster scaling with cron triggers

## 🎯 What This Does

Automated Atlas cluster resizing on schedules with Datadog integration:
- **Cron-based scaling** (scale up/down at specific times)
- **MongoDB Atlas Admin API v2** (official production API)
- **Digest authentication** (using crypto-js + axios)
- **Datadog observability** (structured logs and monitoring)

## 🏗️ Technical Foundation

This solution leverages the **[MongoDB Atlas Administration API v2](https://www.mongodb.com/docs/atlas/reference/api-resources-spec/v2/)** for cluster management operations:

- **API Version:** `application/vnd.atlas.2023-02-01+json`
- **Authentication:** HTTP Digest Authentication (RFC 2617)
- **Endpoint:** `https://cloud.mongodb.com/api/atlas/v2/groups/{groupId}/clusters/{clusterName}`
- **Operations:** GET (cluster info) + PATCH (cluster resize)

### Atlas API Integration Benefits:
- ✅ **Official MongoDB API** - Production-grade reliability
- ✅ **Complete cluster control** - All instance sizes and configurations
- ✅ **Real-time operations** - Immediate cluster modifications
- ✅ **Audit integration** - Full operation tracking in Atlas Activity Feed

## 🔧 Functions Included

1. **`cluster-resize-function.js`** - Main auto-scaling logic using Atlas API v2
2. **`datadog-forwarder-function.js`** - Log forwarding to Datadog

## ✅ Tested & Validated

- ✅ **Atlas API v2 integration** (cluster GET/PATCH operations)
- ✅ **Cluster resize** (M30→M40 successfully tested)
- ✅ **Digest authentication** (proper RFC 2617 implementation)
- ✅ **Datadog integration** (logs flowing to US5 instance)
- ✅ **Cron scheduling** (time-based triggers working)

## 🚀 Quick Implementation

1. **Deploy cluster-resize-function.js** to Atlas App Services
2. **Configure App Services Values:**

ATLAS_PUBLIC_KEY (Secret)    # Atlas API public key

ATLAS_PRIVATE_KEY (Secret)   # Atlas API private key

PROJECT_ID (Value)           # Atlas project ID

CLUSTER_NAME (Value)         # Target cluster name

3. **Create Scheduled Trigger:**
```javascript
// Scale up at 8 AM: { targetInstanceSize: "M40" }
// Scale down at 6 PM: { targetInstanceSize: "M10" }
```
📅 Common Cron Patterns
Business Hours Scaling:
Scale Up:   0 8 * * 1-5    (8 AM, Monday-Friday)
Scale Down: 0 18 * * 1-5   (6 PM, Monday-Friday)
Weekend Optimization:
Weekend Down: 0 20 * * 5   (8 PM Friday)
Weekend Up:   0 6 * * 1    (6 AM Monday)
Daily Cost Optimization:
Night Scale Down: 0 22 * * *  (10 PM daily)
Morning Scale Up: 0 6 * * *   (6 AM daily)
📊 For Datadog Integration (Optional)

Deploy datadog-forwarder-function.js
Configure Values:
DATADOG_API_KEY (Secret)
DATADOG_SITE (Value) - your Datadog site (e.g., us5.datadoghq.com)

Set up Log Forwarder pointing to the function

📋 Dependencies
Both functions use MongoDB-approved libraries:

axios - HTTP client for Atlas API v2 communication
crypto-js - MD5 hashing for digest authentication

🔗 References

MongoDB Atlas Administration API v2 - [Official API documentation] (https://www.mongodb.com/docs/atlas/reference/api-resources-spec/v2/)

🔍 Implementation Considerations
Technical teams should validate:

Security of digest auth implementation
Atlas API v2 rate limits and quotas
Cron schedule alignment with business needs
Production readiness for your environment
Cost optimization targets for your workloads


Ready for scheduled production scaling with Atlas API v2! 🎯
