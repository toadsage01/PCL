variable "host_port" {
  description = "Host port the portal is served on."
  type        = number
  default     = 3000
}

variable "container_name" {
  description = "Docker container name."
  type        = string
  default     = "pcl-web"
}

variable "image_name" {
  description = "Built image repository name."
  type        = string
  default     = "pcl-web"
}

variable "image_tag" {
  description = "Built image tag."
  type        = string
  default     = "latest"
}

variable "employee_domain" {
  description = "Work-email domain accepted on /api/submit."
  type        = string
  default     = "praper.in"
}

variable "gas_web_app_url" {
  description = "Apps Script Web App /exec URL (same value as the Vercel GOOGLE_SCRIPT_WEBAPP_URL env var)."
  type        = string
  sensitive   = true
}
