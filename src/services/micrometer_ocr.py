"""
Micrometer OCR Reader using Azure Computer Vision
This script reads digital micrometer displays and extracts numeric values
"""

import os
import sys
import re
import time
import base64
import requests
from PIL import Image, ImageEnhance, ImageFilter
import io
import numpy as np

# Azure Computer Vision Configuration
# Using same keys as IPQC OCR (from .env file)
AZURE_CV_KEY = '78ROlPKtUHUaFIwMFnzqYwOu1VvSS2VuksdXBVQkKln1fnoBl1KfJQQJ99BIAC3pKaRXJ3w3AAAFACOGJvB4'
AZURE_CV_ENDPOINT = 'https://ocr-app14007.cognitiveservices.azure.com'


def preprocess_micrometer_image(image_path):
    """
    Preprocess micrometer image for better OCR accuracy
    - Rotate if vertical display
    - Enhance contrast
    - Convert to grayscale
    - Apply sharpening
    """
    try:
        img = Image.open(image_path)
        
        # Check if image is vertical (micrometer display is often vertical)
        width, height = img.size
        if height > width * 1.5:
            # Rotate 90 degrees clockwise to make it horizontal
            img = img.rotate(-90, expand=True)
            print("Image rotated 90 degrees for horizontal reading")
        
        # Convert to RGB if needed
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Enhance contrast significantly for LCD displays
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.5)
        
        # Enhance brightness
        enhancer = ImageEnhance.Brightness(img)
        img = enhancer.enhance(1.3)
        
        # Sharpen the image
        img = img.filter(ImageFilter.SHARPEN)
        img = img.filter(ImageFilter.SHARPEN)
        
        # Resize to make digits larger (helps OCR)
        new_width = max(800, img.width * 2)
        ratio = new_width / img.width
        new_height = int(img.height * ratio)
        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        return img
        
    except Exception as e:
        print(f"Error preprocessing image: {e}")
        return None


def image_to_base64(image):
    """Convert PIL Image to base64 string"""
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


def extract_text_azure_ocr(image):
    """
    Use Azure Computer Vision OCR to extract text from image
    """
    if not AZURE_CV_KEY:
        print("ERROR: Azure CV Key not configured!")
        return None
    
    if not AZURE_CV_ENDPOINT:
        print("ERROR: Azure CV Endpoint not configured!")
        return None
    
    try:
        # Convert image to bytes
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        image_bytes = buffer.getvalue()
        
        # Azure OCR Read API endpoint
        analyze_url = f"{AZURE_CV_ENDPOINT}/vision/v3.2/read/analyze"
        
        headers = {
            'Ocp-Apim-Subscription-Key': AZURE_CV_KEY,
            'Content-Type': 'application/octet-stream'
        }
        
        # Submit image for analysis
        print("Submitting image to Azure OCR...")
        response = requests.post(analyze_url, headers=headers, data=image_bytes)
        
        if response.status_code != 202:
            print(f"Error: {response.status_code} - {response.text}")
            return None
        
        # Get operation location
        operation_location = response.headers.get('Operation-Location')
        if not operation_location:
            print("Error: No Operation-Location in response")
            return None
        
        # Poll for results
        print("Waiting for OCR results...")
        result = None
        for attempt in range(30):
            time.sleep(1)
            
            result_response = requests.get(
                operation_location,
                headers={'Ocp-Apim-Subscription-Key': AZURE_CV_KEY}
            )
            
            result = result_response.json()
            
            if result.get('status') == 'succeeded':
                break
            elif result.get('status') == 'failed':
                print("OCR analysis failed")
                return None
        
        if result.get('status') != 'succeeded':
            print("OCR timed out")
            return None
        
        # Extract text from results
        extracted_text = []
        if result.get('analyzeResult') and result['analyzeResult'].get('readResults'):
            for page in result['analyzeResult']['readResults']:
                for line in page.get('lines', []):
                    extracted_text.append(line.get('text', ''))
                    print(f"  Found text: {line.get('text', '')}")
        
        return extracted_text
        
    except Exception as e:
        print(f"Error in Azure OCR: {e}")
        return None


def parse_micrometer_value(text_list):
    """
    Parse micrometer reading from OCR text
    Handles various formats:
    - 0.128
    - 0,128 (European format)
    - Vertical readings (0 1 2 8)
    """
    if not text_list:
        return None
    
    all_text = ' '.join(text_list)
    print(f"\nRaw OCR text: {all_text}")
    
    # Pattern 1: Standard decimal number (0.128 or 0,128)
    decimal_pattern = r'(\d+[.,]\d+)'
    match = re.search(decimal_pattern, all_text)
    if match:
        value = match.group(1).replace(',', '.')
        return float(value)
    
    # Pattern 2: Vertical digits (each digit on separate line)
    # Join all single digits/characters
    digits = []
    for text in text_list:
        text = text.strip()
        # Check if it's a single digit or decimal point
        if re.match(r'^[\d.,]$', text):
            digits.append(text)
        # Check if text contains only digits and decimal
        elif re.match(r'^[\d.,]+$', text):
            return float(text.replace(',', '.'))
    
    if digits:
        # Try to form a number from vertical digits
        number_str = ''.join(digits).replace(',', '.')
        try:
            return float(number_str)
        except:
            pass
    
    # Pattern 3: Extract any number-like sequence
    numbers = re.findall(r'[\d.,]+', all_text)
    for num in numbers:
        try:
            # Clean up and convert
            clean_num = num.replace(',', '.').strip('.')
            if '.' in clean_num:
                return float(clean_num)
        except:
            continue
    
    # Pattern 4: Handle LCD digit segments that might be misread
    # Common OCR mistakes: 0->O, 1->I/l, 8->B, etc.
    corrected_text = all_text
    corrections = {
        'O': '0', 'o': '0',
        'I': '1', 'l': '1', 'i': '1',
        'B': '8', 'b': '8',
        'S': '5', 's': '5',
        'Z': '2', 'z': '2',
        'G': '6', 'g': '6',
    }
    for wrong, correct in corrections.items():
        corrected_text = corrected_text.replace(wrong, correct)
    
    match = re.search(decimal_pattern, corrected_text)
    if match:
        value = match.group(1).replace(',', '.')
        return float(value)
    
    return None


def read_micrometer(image_path):
    """
    Main function to read micrometer value from image
    """
    print(f"\n{'='*50}")
    print(f"Reading micrometer from: {image_path}")
    print('='*50)
    
    # Step 1: Preprocess image
    print("\n[Step 1] Preprocessing image...")
    processed_image = preprocess_micrometer_image(image_path)
    if processed_image is None:
        print("Failed to preprocess image")
        return None
    
    # Save preprocessed image for debugging
    debug_path = image_path.rsplit('.', 1)[0] + '_processed.png'
    processed_image.save(debug_path)
    print(f"Preprocessed image saved to: {debug_path}")
    
    # Step 2: Run OCR
    print("\n[Step 2] Running Azure OCR...")
    text_list = extract_text_azure_ocr(processed_image)
    
    if not text_list:
        print("No text extracted from image")
        return None
    
    # Step 3: Parse micrometer value
    print("\n[Step 3] Parsing micrometer value...")
    value = parse_micrometer_value(text_list)
    
    if value is not None:
        print(f"\n{'='*50}")
        print(f"✓ MICROMETER READING: {value} mm")
        print('='*50)
    else:
        print("\n⚠ Could not parse micrometer value from OCR text")
    
    return value


def read_micrometer_from_base64(base64_string):
    """
    Read micrometer from base64 encoded image
    """
    try:
        # Decode base64
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        image_data = base64.b64decode(base64_string)
        image = Image.open(io.BytesIO(image_data))
        
        # Save temporarily
        temp_path = 'temp_micrometer.png'
        image.save(temp_path)
        
        result = read_micrometer(temp_path)
        
        # Cleanup
        if os.path.exists(temp_path):
            os.remove(temp_path)
        
        return result
        
    except Exception as e:
        print(f"Error processing base64 image: {e}")
        return None


# Test function
def test_ocr():
    """Test OCR with sample image"""
    print("\n" + "="*60)
    print("MICROMETER OCR TEST")
    print("="*60)
    
    # Check for test images
    test_images = [
        'micrometer.jpg',
        'micrometer.png',
        'test_micrometer.jpg',
        'test_micrometer.png'
    ]
    
    found_image = None
    for img in test_images:
        if os.path.exists(img):
            found_image = img
            break
    
    if found_image:
        result = read_micrometer(found_image)
        return result
    else:
        print("\nNo test image found!")
        print("Please provide an image path as argument:")
        print("  python micrometer_ocr.py <image_path>")
        return None


if __name__ == '__main__':
    if len(sys.argv) > 1:
        # Read from provided image path
        image_path = sys.argv[1]
        if os.path.exists(image_path):
            read_micrometer(image_path)
        else:
            print(f"Error: File not found: {image_path}")
    else:
        # Run test
        test_ocr()
