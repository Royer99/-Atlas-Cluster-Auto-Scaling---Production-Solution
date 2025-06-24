/**
 * Atlas Trigger Function: Resize cluster using crypto-js
 * 
 * Uses the built-in crypto-js library instead of custom MD5 implementation
 */

exports = async function(changeEvent) {
  const axios = require("axios").default;
  const CryptoJS = require("crypto-js");
  
  // Configuration - MUST be stored as App Services Values
  const PUBLIC_KEY = context.values.get("ATLAS_PUBLIC_KEY");
  const PRIVATE_KEY = context.values.get("ATLAS_PRIVATE_KEY");
  const PROJECT_ID = context.values.get("PROJECT_ID");
  const CLUSTER_NAME = context.values.get("CLUSTER_NAME");
  
  // Validate required configuration
  if (!PUBLIC_KEY || !PRIVATE_KEY || !PROJECT_ID || !CLUSTER_NAME) {
    throw new Error("Missing required configuration. Please set ATLAS_PUBLIC_KEY, ATLAS_PRIVATE_KEY, PROJECT_ID, and CLUSTER_NAME in App Services Values.");
  }
  
  const targetInstanceSize = changeEvent?.targetInstanceSize || "M40";
  const base = `https://cloud.mongodb.com/api/atlas/v2/groups/${PROJECT_ID}/clusters/${CLUSTER_NAME}`;

  // Simple MD5 using crypto-js
  function md5(str) {
    return CryptoJS.MD5(str).toString();
  }

  // Parse WWW-Authenticate header
  function parseAuthHeader(authHeader) {
    const authParts = {};
    const regex = /(\w+)=(?:"([^"]+)"|([^,]+))/g;
    let match;
    
    while ((match = regex.exec(authHeader)) !== null) {
      authParts[match[1]] = match[2] || match[3];
    }
    
    return authParts;
  }

  // Create digest authentication header with qop support
  function createDigestAuth(method, uri, username, password, authData) {
    const ha1 = md5(`${username}:${authData.realm}:${password}`);
    const ha2 = md5(`${method}:${uri}`);
    
    // Handle qop="auth" - requires nc (nonce count) and cnonce (client nonce)
    let response;
    let authString = `username="${username}", realm="${authData.realm}", nonce="${authData.nonce}", uri="${uri}"`;
    
    if (authData.qop && authData.qop === 'auth') {
      const nc = '00000001'; // nonce count
      const cnonce = CryptoJS.MD5(Math.random().toString()).toString().substring(0, 8); // client nonce using crypto-js
      
      response = md5(`${ha1}:${authData.nonce}:${nc}:${cnonce}:${authData.qop}:${ha2}`);
      authString += `, qop=${authData.qop}, nc=${nc}, cnonce="${cnonce}"`;
    } else {
      response = md5(`${ha1}:${authData.nonce}:${ha2}`);
    }
    
    authString += `, response="${response}"`;
    
    if (authData.algorithm) {
      authString += `, algorithm=${authData.algorithm}`;
    }
    
    return `Digest ${authString}`;
  }

  // Helper function to sanitize cluster specs
  function sanitize(specs, instanceSize) {
    if (!specs) return undefined;
    const { nodeCount, diskIOPS, ebsVolumeType, diskSizeGB } = specs;
    return {
      instanceSize: instanceSize,
      nodeCount,
      ...(diskIOPS && { diskIOPS }),
      ...(ebsVolumeType && { ebsVolumeType }),
      ...(diskSizeGB && { diskSizeGB })
    };
  }

  try {
    console.log(`Starting cluster resize for ${CLUSTER_NAME} to ${targetInstanceSize}`);
    
    // Step 1: Make initial GET request to get digest challenge
    console.log(`Making initial GET request to: ${base}`);
    
    const initialResponse = await axios({
      method: 'GET',
      url: base,
      headers: {
        'Accept': 'application/vnd.atlas.2023-02-01+json',
        'Content-Type': 'application/vnd.atlas.2023-02-01+json'
      },
      validateStatus: function (status) {
        return status === 401 || (status >= 200 && status < 300);
      },
      timeout: 30000
    });

    console.log(`Initial response status: ${initialResponse.status}`);

    if (initialResponse.status !== 401) {
      throw new Error(`Expected 401 challenge, got ${initialResponse.status}`);
    }

    // Parse digest challenge
    const authHeader = initialResponse.headers['www-authenticate'];
    console.log(`WWW-Authenticate header: ${authHeader}`);
    
    if (!authHeader || !authHeader.toLowerCase().includes('digest')) {
      throw new Error('Server does not support digest authentication');
    }

    const authData = parseAuthHeader(authHeader);
    console.log(`Parsed auth data:`, JSON.stringify(authData));
    
    const uri = new URL(base).pathname;
    const digestAuth = createDigestAuth('GET', uri, PUBLIC_KEY, PRIVATE_KEY, authData);
    
    console.log(`Created digest auth header: ${digestAuth.substring(0, 50)}...`);

    // Step 2: Make authenticated GET request
    const getResponse = await axios({
      method: 'GET',
      url: base,
      headers: {
        'Accept': 'application/vnd.atlas.2023-02-01+json',
        'Content-Type': 'application/vnd.atlas.2023-02-01+json',
        'Authorization': digestAuth
      },
      timeout: 30000
    });

    console.log(`Authenticated GET response status: ${getResponse.status}`);
    
    const cluster = getResponse.data;
    const firstRC = cluster.replicationSpecs[0].regionConfigs[0].electableSpecs;
    
    console.log('Current cluster size:', JSON.stringify(firstRC));

    // Build resize payload
    const body = {
      replicationSpecs: cluster.replicationSpecs.map(spec => ({
        numShards: spec.numShards,
        zoneName: spec.zoneName,
        regionConfigs: spec.regionConfigs.map(rc => ({
          providerName: rc.providerName,
          regionName: rc.regionName,
          priority: rc.priority,
          electableSpecs: sanitize(rc.electableSpecs, targetInstanceSize),
          readOnlySpecs: sanitize(rc.readOnlySpecs, targetInstanceSize),
          analyticsSpecs: sanitize(rc.analyticsSpecs, targetInstanceSize)
        }))
      }))
    };

    // Step 3: Get fresh nonce for PATCH request
    console.log(`Making initial PATCH request to get fresh nonce...`);
    
    const patchChallengeResponse = await axios({
      method: 'PATCH',
      url: base,
      data: body,
      headers: {
        'Accept': 'application/vnd.atlas.2023-02-01+json',
        'Content-Type': 'application/vnd.atlas.2023-02-01+json'
      },
      validateStatus: function (status) {
        return status === 401 || (status >= 200 && status < 300);
      },
      timeout: 30000
    });

    console.log(`PATCH challenge response status: ${patchChallengeResponse.status}`);

    if (patchChallengeResponse.status !== 401) {
      throw new Error(`Expected 401 challenge for PATCH, got ${patchChallengeResponse.status}`);
    }

    // Parse fresh digest challenge for PATCH
    const patchAuthHeader = patchChallengeResponse.headers['www-authenticate'];
    console.log(`PATCH WWW-Authenticate header: ${patchAuthHeader}`);
    
    const patchAuthData = parseAuthHeader(patchAuthHeader);
    console.log(`PATCH parsed auth data:`, JSON.stringify(patchAuthData));
    
    const patchDigestAuth = createDigestAuth('PATCH', uri, PUBLIC_KEY, PRIVATE_KEY, patchAuthData);
    console.log(`PATCH digest auth header: ${patchDigestAuth.substring(0, 50)}...`);

    // Step 4: Make authenticated PATCH request with fresh nonce
    const patchResponse = await axios({
      method: 'PATCH',
      url: base,
      data: body,
      headers: {
        'Accept': 'application/vnd.atlas.2023-02-01+json',
        'Content-Type': 'application/vnd.atlas.2023-02-01+json',
        'Authorization': patchDigestAuth
      },
      timeout: 30000
    });

    console.log(`PATCH response status: ${patchResponse.status}`);
    
    const result = patchResponse.data;
    console.log('Cluster resize initiated:', result.stateName);

    // Log success to database
    try {
      const db = context.services.get("mongodb-atlas").db("logs");
      await db.collection("cluster_operations").insertOne({
        timestamp: new Date(),
        operation: "resize",
        clusterName: CLUSTER_NAME,
        fromSize: firstRC.instanceSize,
        toSize: targetInstanceSize,
        status: result.stateName,
        triggeredBy: changeEvent?.operationType || "manual"
      });
    } catch (logError) {
      console.log('Audit logging failed (non-critical):', logError.message);
    }

    return {
      success: true,
      message: `Cluster resize initiated: ${result.stateName}`,
      clusterName: CLUSTER_NAME,
      previousSize: firstRC.instanceSize,
      newSize: targetInstanceSize,
      stateName: result.stateName,
      method: "crypto-js_digest_auth"
    };

  } catch (error) {
    console.error('Cluster resize failed:', error.message);
    
    if (error.response) {
      console.error(`Error response status: ${error.response.status}`);
      console.error(`Error response data:`, JSON.stringify(error.response.data));
    }
    
    // Log error to database
    try {
      const db = context.services.get("mongodb-atlas").db("logs");
      await db.collection("cluster_operations").insertOne({
        timestamp: new Date(),
        operation: "resize",
        clusterName: CLUSTER_NAME,
        targetSize: targetInstanceSize,
        error: error.message,
        status: "failed"
      });
    } catch (logError) {
      console.log('Error logging failed (non-critical):', logError.message);
    }
    
    return {
      success: false,
      error: error.message,
      clusterName: CLUSTER_NAME
    };
  }
};
