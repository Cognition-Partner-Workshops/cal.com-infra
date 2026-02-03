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
