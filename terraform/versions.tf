# PCL internal portal — Terraform (docker provider).
# Builds the image from the repo Dockerfile and runs it on the host.
#   cd terraform
#   cp terraform.tfvars.example terraform.tfvars   (fill gas_web_app_url)
#   terraform init && terraform apply
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {}
