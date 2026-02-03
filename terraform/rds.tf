resource "aws_db_subnet_group" "calcom" {
  name        = "calcom-db-subnet-group"
  description = "Subnet group for Cal.com RDS database"
  subnet_ids  = aws_subnet.public[*].id

  tags = {
    Name = "CalComDBSubnetGroup"
  }
}

resource "aws_db_instance" "calcom" {
  identifier = "calcom-database"

  engine         = "postgres"
  engine_version = "15"
  instance_class = var.db_instance_class

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"

  vpc_security_group_ids = [aws_security_group.db.id]
  db_subnet_group_name   = aws_db_subnet_group.calcom.name

  publicly_accessible = var.db_publicly_accessible
  multi_az            = var.db_multi_az

  backup_retention_period   = var.db_backup_retention_period
  delete_automated_backups  = true
  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "calcom-database-final-snapshot"

  tags = {
    Name = "CalComDatabasePublic"
  }
}
