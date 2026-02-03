#!/bin/bash

echo "Retrieving Cal.com database credentials from Terraform outputs..."
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$(dirname "$SCRIPT_DIR")"

cd "$TERRAFORM_DIR" || exit 1

if ! terraform output -json > /dev/null 2>&1; then
  echo "Error: Could not retrieve Terraform outputs. Make sure Terraform has been applied."
  exit 1
fi

SECRET_NAME=$(terraform output -raw db_credentials_secret_name 2>/dev/null)

if [ -z "$SECRET_NAME" ]; then
  echo "Error: Could not retrieve secret name from Terraform outputs."
  exit 1
fi

SECRET=$(aws secretsmanager get-secret-value --secret-id "$SECRET_NAME" --query SecretString --output text 2>/dev/null)

if [ $? -ne 0 ]; then
  echo "Error: Could not retrieve credentials from Secrets Manager. Make sure you have AWS credentials configured."
  exit 1
fi

USERNAME=$(echo "$SECRET" | jq -r '.username')
PASSWORD=$(echo "$SECRET" | jq -r '.password')

ENDPOINT=$(terraform output -raw db_endpoint 2>/dev/null)
PORT=$(terraform output -raw db_port 2>/dev/null)
DBNAME=$(terraform output -raw db_name 2>/dev/null)

echo "Database Credentials:"
echo "===================="
echo "Username: $USERNAME"
echo "Password: $PASSWORD"
echo ""
echo "Connection Details:"
echo "===================="
echo "Endpoint: $ENDPOINT"
echo "Port: $PORT"
echo "Database: $DBNAME"
echo ""
echo "Connection String:"
echo "===================="
echo "postgresql://$USERNAME:$PASSWORD@$ENDPOINT:$PORT/$DBNAME"
echo ""
echo "Environment Variables:"
echo "===================="
echo "export DATABASE_URL=\"postgresql://$USERNAME:$PASSWORD@$ENDPOINT:$PORT/$DBNAME\""
echo "export DB_HOST=\"$ENDPOINT\""
echo "export DB_PORT=\"$PORT\""
echo "export DB_NAME=\"$DBNAME\""
echo "export DB_USER=\"$USERNAME\""
echo "export DB_PASSWORD=\"$PASSWORD\""
