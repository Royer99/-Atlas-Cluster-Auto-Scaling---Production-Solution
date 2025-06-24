# Setup Guide for Implementation

## 🔧 Atlas App Services Setup

### 1. Create Functions

**Function 1: cluster-resize-function**
- Name: `resize-cluster-production` (or your preferred name)
- Authentication: System
- Private: Yes
- Code: Copy from `cluster-resize-function.js`

**Function 2: datadog-forwarder-function**  
- Name: `datadog-log-forwarder`
- Authentication: System
- Private: Yes
- Code: Copy from `datadog-forwarder-function.js`

### 2. Configure App Services Values

**For Cluster Resize:**
