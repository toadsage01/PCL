output "container_name" {
  value = docker_container.pcl_web.name
}

output "portal_url" {
  value = "http://localhost:${var.host_port}/"
}

output "health_url" {
  value = "http://localhost:${var.host_port}/healthz"
}
