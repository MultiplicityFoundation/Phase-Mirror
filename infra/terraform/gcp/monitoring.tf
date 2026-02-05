# infra/terraform/gcp/monitoring.tf

# ============================================
# CIRCUIT BREAKER ALERTS
# ============================================

resource "google_monitoring_alert_policy" "circuit_breaker_threshold" {
  display_name = "Phase Mirror - Circuit Breaker Threshold Exceeded"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Block count exceeds threshold per hour"
    
    condition_threshold {
      filter          = <<-EOT
        resource.type="firestore_database"
        AND metric.type="firestore.googleapis.com/document/write_count"
        AND resource.label.collection="block-counter"
      EOT
      
      duration        = "300s"  # 5 minutes sustained
      comparison      = "COMPARISON_GT"
      threshold_value = 10      # Match circuit breaker threshold
      
      aggregations {
        alignment_period   = "3600s"  # 1 hour buckets
        per_series_aligner = "ALIGN_SUM"
      }
      
      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.ops_email.id]

  alert_strategy {
    auto_close = "86400s"  # Auto-close after 24h if resolved
  }

  documentation {
    content   = <<-EOT
      ## Circuit Breaker Triggered
      
      The Phase Mirror Oracle has blocked more than 10 PRs in the past hour for a single rule.
      
      **Immediate Actions:**
      1. Check Firestore `block-counter` collection for affected rule ID
      2. Review recent PRs for pattern (false positive wave?)
      3. Consider marking as FP or adjusting rule threshold
      
      **Degraded Mode:** Oracle should auto-degrade to WARN-only for affected rule.
    EOT
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "degraded_mode_active" {
  display_name = "Phase Mirror - Degraded Mode Active"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Degraded mode duration exceeds 30 minutes"
    
    condition_threshold {
      filter          = <<-EOT
        metric.type="custom.googleapis.com/phase_mirror/degraded_mode_active"
        AND resource.type="global"
      EOT
      
      duration        = "1800s"  # 30 minutes
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MAX"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.ops_email.id]
}

# ============================================
# SECRET MANAGER / NONCE ALERTS
# ============================================

resource "google_monitoring_alert_policy" "nonce_access_failure" {
  display_name = "Phase Mirror - Nonce Access Failure"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Secret Manager access errors"
    
    condition_threshold {
      filter          = <<-EOT
        resource.type="secretmanager.googleapis.com/Secret"
        AND resource.label.secret_id="redaction-nonce"
        AND metric.type="secretmanager.googleapis.com/secret/access_count"
        AND metric.label.status!="SUCCESS"
      EOT
      
      duration        = "60s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }

  notification_channels = [
    google_monitoring_notification_channel.ops_email.id,
    google_monitoring_notification_channel.pagerduty.id  # Critical path
  ]

  documentation {
    content = <<-EOT
      ## CRITICAL: Nonce Access Failure
      
      The Oracle cannot load the HMAC nonce from Secret Manager.
      **This is fail-closed - all operations will fail.**
      
      **Immediate Actions:**
      1. Check Secret Manager permissions for Oracle service account
      2. Verify secret `redaction-nonce` exists and has active version
      3. Check Workload Identity binding if running from GKE/Cloud Run
    EOT
  }
}

# ============================================
# FIRESTORE PERFORMANCE ALERTS  
# ============================================

resource "google_monitoring_alert_policy" "fp_store_latency" {
  display_name = "Phase Mirror - FP Store High Latency"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "FP query p99 exceeds 50ms target"
    
    condition_threshold {
      filter          = <<-EOT
        resource.type="firestore_database"
        AND metric.type="firestore.googleapis.com/api/request_latencies"
        AND metric.label.method=~".*Query.*|.*Get.*"
      EOT
      
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 50  # 50ms target from spec
      
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_MAX"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.ops_email.id]
}

resource "google_monitoring_alert_policy" "firestore_errors" {
  display_name = "Phase Mirror - Firestore Error Rate"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Firestore errors exceed 1%"
    
    condition_threshold {
      filter          = <<-EOT
        resource.type="firestore_database"
        AND metric.type="firestore.googleapis.com/api/request_count"
        AND metric.label.status!="OK"
      EOT
      
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.01  # 1% error rate
      
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.ops_email.id]
}

# ============================================
# NOTIFICATION CHANNELS
# ============================================

resource "google_monitoring_notification_channel" "ops_email" {
  display_name = "Phase Mirror Ops Email"
  project      = var.project_id
  type         = "email"
  
  labels = {
    email_address = var.ops_email
  }
}

resource "google_monitoring_notification_channel" "pagerduty" {
  display_name = "Phase Mirror PagerDuty"
  project      = var.project_id
  type         = "pagerduty"
  
  labels = {
    service_key = var.pagerduty_service_key
  }
  
  sensitive_labels {
    service_key = var.pagerduty_service_key
  }
}

# ============================================
# CUSTOM METRICS (for degraded mode tracking)
# ============================================

resource "google_monitoring_metric_descriptor" "degraded_mode" {
  project      = var.project_id
  type         = "custom.googleapis.com/phase_mirror/degraded_mode_active"
  metric_kind  = "GAUGE"
  value_type   = "INT64"
  display_name = "Phase Mirror Degraded Mode Active"
  description  = "1 if circuit breaker has activated degraded mode, 0 otherwise"
  
  labels {
    key         = "rule_id"
    value_type  = "STRING"
    description = "The rule ID in degraded mode"
  }
}

# ============================================
# DASHBOARD
# ============================================

resource "google_monitoring_dashboard" "phase_mirror" {
  project        = var.project_id
  dashboard_json = jsonencode({
    displayName = "Phase Mirror Operations"
    gridLayout = {
      columns = 2
      widgets = [
        {
          title = "Circuit Breaker Status"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"custom.googleapis.com/phase_mirror/degraded_mode_active\""
                }
              }
            }]
          }
        },
        {
          title = "FP Store Query Latency (p99)"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"firestore_database\" AND metric.type=\"firestore.googleapis.com/api/request_latencies\""
                  aggregation = {
                    alignmentPeriod  = "60s"
                    perSeriesAligner = "ALIGN_PERCENTILE_99"
                  }
                }
              }
            }]
          }
        },
        {
          title = "Block Events per Hour"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"firestore_database\" AND metric.type=\"firestore.googleapis.com/document/write_count\" AND resource.label.collection=\"block-counter\""
                }
              }
            }]
          }
        },
        {
          title = "Secret Manager Access"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"secretmanager.googleapis.com/Secret\" AND metric.type=\"secretmanager.googleapis.com/secret/access_count\""
                }
              }
            }]
          }
        }
      ]
    }
  })
}
