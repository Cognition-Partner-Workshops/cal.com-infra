data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "calcom" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "CalComVPC"
  }
}

resource "aws_internet_gateway" "calcom" {
  vpc_id = aws_vpc.calcom.id

  tags = {
    Name = "CalComIGW"
  }
}

resource "aws_subnet" "public" {
  count                   = length(local.azs)
  vpc_id                  = aws_vpc.calcom.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "CalComPublicSubnet-${local.azs[count.index]}"
    Type = "public"
  }
}

resource "aws_subnet" "private" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.calcom.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + length(local.azs))
  availability_zone = local.azs[count.index]

  tags = {
    Name = "CalComPrivateSubnet-${local.azs[count.index]}"
    Type = "private"
  }
}

resource "aws_subnet" "isolated" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.calcom.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 2 * length(local.azs))
  availability_zone = local.azs[count.index]

  tags = {
    Name = "CalComIsolatedSubnet-${local.azs[count.index]}"
    Type = "isolated"
  }
}

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "CalComNATEIP"
  }

  depends_on = [aws_internet_gateway.calcom]
}

resource "aws_nat_gateway" "calcom" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "CalComNATGateway"
  }

  depends_on = [aws_internet_gateway.calcom]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.calcom.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.calcom.id
  }

  tags = {
    Name = "CalComPublicRouteTable"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.calcom.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.calcom.id
  }

  tags = {
    Name = "CalComPrivateRouteTable"
  }
}

resource "aws_route_table" "isolated" {
  vpc_id = aws_vpc.calcom.id

  tags = {
    Name = "CalComIsolatedRouteTable"
  }
}

resource "aws_route_table_association" "public" {
  count          = length(local.azs)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = length(local.azs)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "isolated" {
  count          = length(local.azs)
  subnet_id      = aws_subnet.isolated[count.index].id
  route_table_id = aws_route_table.isolated.id
}

resource "aws_security_group" "db" {
  name        = "CalComDBSecurityGroup"
  description = "Security group for Cal.com RDS PostgreSQL database"
  vpc_id      = aws_vpc.calcom.id

  ingress {
    description = "Allow PostgreSQL access from anywhere"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "CalComDBSecurityGroup"
  }
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "calcom-db-credentials"
  description             = "Credentials for Cal.com PostgreSQL database"
  recovery_window_in_days = 0

  tags = {
    Name = "CalComDBCredentials"
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db_password.result
  })
}

resource "aws_db_subnet_group" "calcom" {
  name        = "calcom-db-subnet-group"
  description = "Subnet group for Cal.com RDS database"
  subnet_ids  = aws_subnet.public[*].id

  tags = {
    Name = "CalComDBSubnetGroup"
  }
}

resource "aws_db_instance" "calcom" {
  identifier     = "calcom-database"
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
  publicly_accessible    = true
  multi_az               = false

  backup_retention_period   = var.db_backup_retention_period
  delete_automated_backups  = true
  deletion_protection       = false
  skip_final_snapshot       = false
  final_snapshot_identifier = "calcom-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  tags = {
    Name = "CalComDatabasePublic"
  }

  lifecycle {
    ignore_changes = [final_snapshot_identifier]
  }
}
