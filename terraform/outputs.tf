output "db_endpoint" {
  description = "Database endpoint address"
  value       = aws_db_instance.calcom.endpoint
}

output "db_address" {
  description = "Database hostname"
  value       = aws_db_instance.calcom.address
}

output "db_port" {
  description = "Database port"
  value       = aws_db_instance.calcom.port
}

output "db_name" {
  description = "Database name"
  value       = aws_db_instance.calcom.db_name
}

output "db_credentials_secret_arn" {
  description = "ARN of the secret containing database credentials"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "db_credentials_secret_name" {
  description = "Name of the secret containing database credentials"
  value       = aws_secretsmanager_secret.db_credentials.name
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.calcom.id
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "isolated_subnet_ids" {
  description = "List of isolated subnet IDs"
  value       = aws_subnet.isolated[*].id
}
