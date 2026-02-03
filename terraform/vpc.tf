data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = length(var.availability_zones) > 0 ? var.availability_zones : slice(data.aws_availability_zones.available.names, 0, 2)
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
  count = length(local.azs)

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
  count = length(local.azs)

  vpc_id            = aws_vpc.calcom.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + length(local.azs))
  availability_zone = local.azs[count.index]

  tags = {
    Name = "CalComPrivateSubnet-${local.azs[count.index]}"
    Type = "private"
  }
}

resource "aws_subnet" "isolated" {
  count = length(local.azs)

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
  count = length(local.azs)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count = length(local.azs)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "isolated" {
  count = length(local.azs)

  subnet_id      = aws_subnet.isolated[count.index].id
  route_table_id = aws_route_table.isolated.id
}
