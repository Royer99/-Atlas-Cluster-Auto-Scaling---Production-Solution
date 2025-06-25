# Setup Guide for Implementation

## 🔧 Atlas App Services Setup

### 1. Create Functions

**Function 1: cluster-resize-scale-up**
- Name: `resize-cluster-scale-up`
- Authentication: System
- Private: Yes
- Code: Copy from `cluster-resize-function.js` and modify:
  ```javascript
  const targetInstanceSize = "M40"; // Hardcode scale-up size
  ```

**Function 2: cluster-resize-scale-down**
- Name: `resize-cluster-scale-down`
- Authentication: System
- Private: Yes
- Code: Copy from `cluster-resize-function.js` and modify:
  ```javascript
  const targetInstanceSize = "M10"; // Hardcode scale-down size
  ```

**Function 3: datadog-forwarder-function (Optional)**  
- Name: `datadog-log-forwarder`
- Authentication: System
- Private: Yes
- Code: Copy from `datadog-forwarder-function.js`

### 2. Configure App Services Values

**For Cluster Resize Functions:**
```
ATLAS_PUBLIC_KEY (Secret): [Your Atlas API public key]
ATLAS_PRIVATE_KEY (Secret): [Your Atlas API private key]
PROJECT_ID (Value): [Your Atlas project ID]
CLUSTER_NAME (Value): [Target cluster name]
```

**For Datadog Integration (Optional):**
```
DATADOG_API_KEY (Secret): [Your Datadog API key]
DATADOG_SITE (Value): [Your Datadog site - e.g., us5.datadoghq.com, datadoghq.eu]
```

### 3. Set Up Scheduled Triggers

**Primary Use Case: Cron-based Scaling**

**Scale Up Trigger (8 AM weekdays):**
- Go to: Triggers > Add Trigger
- Type: **Scheduled**
- Name: `scale-up-business-hours`
- Function: `resize-cluster-scale-up`
- Schedule Expression: `0 8 * * 1-5`

**Scale Down Trigger (6 PM weekdays):**
- Go to: Triggers > Add Trigger
- Type: **Scheduled**
- Name: `scale-down-after-hours`
- Function: `resize-cluster-scale-down` 
- Schedule Expression: `0 18 * * 1-5`


### 4. Test Scheduled Scaling

**Manual Test First:**
```javascript
// Test scale-up function manually:
// Run resize-cluster-scale-up function
// Expected: Cluster scales to M40

// Test scale-down function manually:
// Run resize-cluster-scale-down function  
// Expected: Cluster scales to M10
```

**Verify Cron Schedule:**
- **Check Atlas Activity Feed** for resize operations
- **Monitor function logs** for execution confirmation
- **Validate timing** matches your cron schedule

### 5. Set Up Datadog Integration

**Configure Log Forwarder:**
- Go to: Logs > Forwarders > Add Forwarder
- Name: `cluster-scaling-to-datadog`
- Log Types: Function
- Log Statuses: Success, Error
- Filters: Function Name Contains "resize-cluster"
- Action: To Function → `datadog-log-forwarder`

**Verify in Datadog:**
- Check Logs Explorer for: `source:atlas-app-services`
- Filter by: `service:cluster-auto-scaling`

## ⚠️ Implementation Notes

### Production Considerations

- Use **dedicated clusters** for testing before production
- Test with **small instance changes** first (M30↔M40)
- **Monitor Atlas Activity Feed** for resize status
- **Set up proper alerting** in Datadog for failed operations

### Security Best Practices

- Store **all credentials as Secrets** in App Services Values
- **Never hardcode credentials** in function code
- **Use separate API keys** for different environments
- **Regularly rotate** Atlas API keys


## 📊 Monitoring & Maintenance

### Key Metrics to Track
- **Scaling frequency** - How often clusters resize
- **Success rate** - Percentage of successful operations
- **Cost impact** - Financial effect of right-sizing
- **Performance improvement** - Application response times
