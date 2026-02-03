terraform {
  backend "s3" {
    bucket         = "calcom-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "calcom-terraform-locks"
  }
}
