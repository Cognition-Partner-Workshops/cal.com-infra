provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "cal.com"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
