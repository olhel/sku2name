// Azure Container App for sku2name.
//
// Committed deliberately. The sibling project's environment was configured by
// hand in the portal, which means it cannot be recreated from the repository
// and nobody can see what it is set to without logging in.
//
// Deploy:
//   az deployment group create -g <rg> -f infra/main.bicep -p appName=sku2name

@description('Name of the container app.')
param appName string = 'sku2name'

@description('Location for all resources.')
param location string = resourceGroup().location

@description('Container image to run.')
param image string = 'ghcr.io/olhel/sku2name:latest'

@description('Log Analytics retention in days.')
param retentionInDays int = 30

@description('Minimum replicas. Zero would make the first request after idle pay a cold start.')
@minValue(0)
param minReplicas int = 1

@description('Maximum replicas.')
@minValue(1)
param maxReplicas int = 4

var workspaceName = '${appName}-logs'
var environmentName = '${appName}-env'

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionInDays
  }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  identity: {
    // No Graph or ARM calls are made, so this exists only for pulling from a
    // private registry if the image is ever made private.
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
        // Cloudflare terminates TLS in front of this and is the only thing
        // that should reach the origin.
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
    }
    template: {
      containers: [
        {
          name: appName
          image: image
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/healthz'
                port: 8080
              }
              initialDelaySeconds: 5
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/healthz'
                port: 8080
              }
              initialDelaySeconds: 3
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

output fqdn string = containerApp.properties.configuration.ingress.fqdn
output principalId string = containerApp.identity.principalId
