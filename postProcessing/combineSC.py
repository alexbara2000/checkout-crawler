import os
import sys
from PIL import Image

cart_screenshots = ["screenshots_shopify/checkout/cart/"+fileName for fileName in os.listdir("screenshots_shopify/checkout/cart")]
simple_screenshots = ["screenshots_shopify/checkout/simple/"+fileName for fileName in  os.listdir("screenshots_shopify/checkout/simple")]
size_screenshots = ["screenshots_shopify/checkout/size/"+fileName for fileName in  os.listdir("screenshots_shopify/checkout/size")]
size_cart_screenshots = ["screenshots_shopify/checkout/size_and_cart/"+fileName for fileName in  os.listdir("screenshots_shopify/checkout/size_and_cart")]

all_screenshots = cart_screenshots+simple_screenshots+size_screenshots+size_cart_screenshots
website_to_screenshots = {}

for screenshot in all_screenshots:
    website=screenshot.split("-")[1]
    if website not in website_to_screenshots:
        website_to_screenshots[website] = [screenshot]
    else:
        website_to_screenshots[website].append(screenshot)
print(len(website_to_screenshots))

for website, screenshots in website_to_screenshots.items():
    images = [Image.open(x) for x in screenshots]
    widths, heights = zip(*(i.size for i in images))
    total_width = max(widths)
    max_height = sum(heights)
    new_im = Image.new('RGB', (total_width, max_height))
    y_offset = 0
    for im in images:
        new_im.paste(im, (0,y_offset))
        y_offset += im.size[1]
    new_im.save('postProcessing/shopify1000Checkout/'+ website.replace(".","-")+".png")

