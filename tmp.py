import os
import csv
import re

def normalize_domain(domain):
    """Convert a domain into a regex pattern to match both formats in filenames."""
    domain = domain.replace('.', '-')
    return re.compile(rf'(^|www-){re.escape(domain)}\.png$', re.IGNORECASE)

def get_matching_domains(csv_file, folder_path):
    """Find domains from the CSV file that appear in any filename in the folder."""
    with open(csv_file, newline='') as f:
        reader = csv.reader(f)
        domain_dict = {row[1]: row for row in reader}  # Map domains to their full row
    
    files = set(os.listdir(folder_path))  # Get all filenames in the folder
    matching_domains = set()
    
    for domain in domain_dict.keys():
        pattern = normalize_domain(domain)
        if any(pattern.match(file) for file in files):
            matching_domains.add(domain)
    
    return matching_domains, domain_dict

def filter_csv(csv_file, output_file, folder_path):
    """Remove rows from the CSV file if the domain appears in the folder filenames."""
    matching_domains, domain_dict = get_matching_domains(csv_file, folder_path)
    
    with open(output_file, 'w', newline='') as f:
        writer = csv.writer(f)
        for domain, row in domain_dict.items():
            if domain not in matching_domains:
                writer.writerow(row)

if __name__ == "__main__":
    csv_file = "lists/top1000Shopify_refined.csv"  # Update with your actual CSV filename
    folder_path = "postProcessing/shop1000CheckoutCart"  # Update with the actual folder containing images
    output_file = "tmp.csv"  # Output file
    
    filter_csv(csv_file, output_file, folder_path)
    print("Filtered CSV saved as", output_file)