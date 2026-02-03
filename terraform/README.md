# Cal.com Infrastructure - Terraform

This directory contains Terraform configuration files to provision and manage the Cal.com database infrastructure on AWS. This replaces the previous AWS CDK implementation with Infrastructure as Code (IaC) using Terraform.

## Architecture

The Terraform configuration provisions the following AWS resources:

- **VPC** with 2 availability zones containing:
  - Public subnets (for publicly accessible resources)
  - Private subnets (with NAT gateway egress)
  - Isolated subnets (no internet access)
  - Internet Gateway
  - NAT Gateway (single, for cost optimization)
  - Route tables for each subnet type

- **Security Group** for the RDS database:
  - Allows inbound PostgreSQL traffic (port 5432)
  - Allows all outbound traffic

- **Secrets Manager Secret** for database credentials:
  - Stores username and auto-generated password
  - Secret name: `calcom-db-credentials`

- **RDS PostgreSQL Database**:
  - PostgreSQL 15
  - Instance type: db.t3.micro (configurable)
  - 20GB GP3 storage with autoscaling up to 100GB
  - 7-day backup retention
  - Publicly accessible (for development)

## Prerequisites

1. [Terraform](https://www.terraform.io/downloads.html) >= 1.0.0
2. [AWS CLI](https://aws.amazon.com/cli/) configured with appropriate credentials
3. AWS account with permissions to create VPC, RDS, Secrets Manager, S3, and DynamoDB resources

## State Management

Terraform state is stored remotely in S3 with DynamoDB for state locking. Before using the main configuration, you need to bootstrap the state management infrastructure.

### Bootstrap State Backend (One-time Setup)

```bash
cd terraform/backend-bootstrap

# Initialize and apply the bootstrap configuration
terraform init
terraform plan
terraform apply
```

This creates:
- S3 bucket: `calcom-terraform-state` (versioned, encrypted)
- DynamoDB table: `calcom-terraform-locks` (for state locking)

## Usage

### Initialize Terraform

```bash
cd terraform

# Initialize with the S3 backend
terraform init
```

### Configure Variables

Copy the example variables file and customize as needed:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` to set your desired values:

```hcl
aws_region = "us-east-1"
environment = "dev"
db_instance_class = "db.t3.micro"
# ... other variables
```

### Plan Changes

Review what Terraform will create/modify:

```bash
terraform plan
```

### Apply Configuration

Provision the infrastructure:

```bash
terraform apply
```

Type `yes` when prompted to confirm.

### View Outputs

After applying, view the infrastructure outputs:

```bash
terraform output
```

### Retrieve Database Credentials

Use the provided script to get database connection details:

```bash
./scripts/get-credentials.sh
```

This will output:
- Database credentials (username/password)
- Connection endpoint and port
- Full connection string
- Environment variable exports

### Destroy Infrastructure

To tear down all resources:

```bash
terraform destroy
```

**Note**: The RDS instance will create a final snapshot before deletion.

## Configuration Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region for resources | `us-east-1` |
| `environment` | Environment name (dev, staging, prod) | `dev` |
| `vpc_cidr` | CIDR block for the VPC | `10.0.0.0/16` |
| `availability_zones` | List of AZs to use | `["us-east-1a", "us-east-1b"]` |
| `db_instance_class` | RDS instance class | `db.t3.micro` |
| `db_name` | Database name | `calcom` |
| `db_username` | Master username | `calcom_admin` |
| `db_allocated_storage` | Initial storage (GB) | `20` |
| `db_max_allocated_storage` | Max storage for autoscaling (GB) | `100` |
| `db_backup_retention_period` | Backup retention (days) | `7` |
| `db_publicly_accessible` | Public accessibility | `true` |
| `db_multi_az` | Multi-AZ deployment | `false` |
| `db_deletion_protection` | Deletion protection | `false` |

## Outputs

| Output | Description |
|--------|-------------|
| `db_endpoint` | RDS endpoint address |
| `db_port` | Database port |
| `db_name` | Database name |
| `db_credentials_secret_arn` | ARN of the credentials secret |
| `db_credentials_secret_name` | Name of the credentials secret |
| `vpc_id` | VPC ID |
| `public_subnet_ids` | List of public subnet IDs |
| `private_subnet_ids` | List of private subnet IDs |
| `isolated_subnet_ids` | List of isolated subnet IDs |
| `db_security_group_id` | Database security group ID |

## Integration with Development Workflow

### CI/CD Integration

1. Store AWS credentials as secrets in your CI/CD platform
2. Run `terraform init` and `terraform plan` on pull requests
3. Run `terraform apply` on merge to main branch

Example GitHub Actions workflow:

```yaml
name: Terraform

on:
  push:
    branches: [main]
    paths: ['terraform/**']
  pull_request:
    branches: [main]
    paths: ['terraform/**']

jobs:
  terraform:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: terraform

    steps:
      - uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3

      - name: Terraform Init
        run: terraform init
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: Terraform Plan
        run: terraform plan -no-color
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: Terraform Apply
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        run: terraform apply -auto-approve
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

### Local Development

1. Ensure AWS credentials are configured (`aws configure` or environment variables)
2. Navigate to the terraform directory
3. Run `terraform init` to initialize
4. Run `terraform plan` to preview changes
5. Run `terraform apply` to provision resources
6. Use `./scripts/get-credentials.sh` to get database connection info

## Migration from CDK

This Terraform configuration replaces the AWS CDK stack. The resources are equivalent:

| CDK Resource | Terraform Resource |
|--------------|-------------------|
| `CalComVPC` | `aws_vpc.calcom` |
| `CalComDBSecurityGroup` | `aws_security_group.db` |
| `CalComDBCredentials` | `aws_secretsmanager_secret.db_credentials` |
| `CalComDatabasePublic` | `aws_db_instance.calcom` |

**Note**: If migrating from an existing CDK deployment, you may need to import existing resources into Terraform state or destroy the CDK stack first to avoid conflicts.

## File Structure

```
terraform/
├── backend.tf              # S3 backend configuration
├── backend-bootstrap/      # Bootstrap config for state management
│   └── main.tf
├── outputs.tf              # Output definitions
├── providers.tf            # AWS provider configuration
├── rds.tf                  # RDS database resources
├── README.md               # This file
├── scripts/
│   └── get-credentials.sh  # Credential retrieval script
├── secrets.tf              # Secrets Manager resources
├── security_groups.tf      # Security group resources
├── terraform.tfvars.example # Example variable values
├── variables.tf            # Variable definitions
├── versions.tf             # Provider version constraints
└── vpc.tf                  # VPC and networking resources
```
