resource "docker_image" "pcl_web" {
  name         = "${var.image_name}:${var.image_tag}"
  keep_locally = true

  build {
    context    = "${path.module}/.."
    dockerfile = "Dockerfile"
    label = {
      "org.opencontainers.image.title"       = "pcl-web"
      "org.opencontainers.image.description" = "Praper Content League — internal portal"
    }
  }
}

resource "docker_container" "pcl_web" {
  name    = var.container_name
  image   = docker_image.pcl_web.image_id
  restart = "unless-stopped"

  ports {
    internal = 3000
    external = var.host_port
  }

  env = [
    "PORT=3000",
    "EMPLOYEE_DOMAIN=${var.employee_domain}",
    "GOOGLE_SCRIPT_WEBAPP_URL=${var.gas_web_app_url}"
  ]

  healthcheck {
    test         = ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/healthz"]
    interval     = "30s"
    timeout      = "5s"
    start_period = "5s"
    retries      = 3
  }
}
