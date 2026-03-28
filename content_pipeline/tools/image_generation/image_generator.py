import asyncio
import os
from pathlib import Path
import time
from typing import NamedTuple

from playwright.async_api import async_playwright


class PlatformSpec(NamedTuple):
    width: int
    height: int
    aspect_ratio: str
    label: str


IMAGE_OUTPUT_DIR = Path(
    os.getenv(
        "IMAGE_OUTPUT_DIR", str(Path(__file__).parent.parent / "generated_images")
    )
)

PLATFORM_SPECS: dict[str, PlatformSpec] = {
    "twitter": PlatformSpec(1200, 675, "16:9", "X / Twitter"),
    "linkedin": PlatformSpec(1200, 627, "1.91:1", "LinkedIn"),
    "instagram": PlatformSpec(1080, 1080, "1:1", "Instagram"),
}

SUPPORTED_PLATFORMS: set[str] = set(PLATFORM_SPECS.keys())

BRAND_IMAGES_DIR = os.getenv(
    "BRAND_IMAGES_DIR", str(Path(__file__).parent / "brand_images")
)


def render_image(platform, data, company_name, output_path):
    if platform == "instagram":
        asyncio.run(generate_post_insta(data, company_name, image_path=output_path))
    if platform == "linkedin":
        asyncio.run(generate_post_linkedin(data, company_name, image_path=output_path))


async def generate_post_insta(data, company_name, image_path):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        context = await browser.new_context(
            viewport={
                "width": PLATFORM_SPECS["instagram"].width,
                "height": PLATFORM_SPECS["instagram"].height,
            },
            device_scale_factor=2,
        )

        page = await context.new_page()

        await page.goto("http://localhost:8080/instagram_post_template.html")

        await page.evaluate(
            """
        (data) => {
            document.getElementById("headline-text").innerText = data.headline;
            document.querySelector(".subtext").innerText = data.subtext;
            document.querySelector(".cta").innerText = data.cta;

            document.querySelector("#logo-img").setAttribute("src", data.logo)
            document.querySelector("#background-img").setAttribute("src", data.background_image)

            document.documentElement.style.setProperty("--brand-primary", data.brand_colors.primary)
            document.documentElement.style.setProperty("--brand-secondary", data.brand_colors.secondary)
            window.renderDone = false;
        }
        """,
            data,
        )

        await page.evaluate("fitContent()")
        await page.wait_for_function("window.renderDone === true")
        time.sleep(1)
        await page.screenshot(path=image_path)
        await browser.close()


async def generate_post_linkedin(data, company_name, image_path):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        context = await browser.new_context(
            viewport={
                "width": PLATFORM_SPECS["linkedin"].width,
                "height": PLATFORM_SPECS["linkedin"].height,
            },
            device_scale_factor=2,
        )

        page = await context.new_page()

        await page.goto("http://localhost:8080/linkedin_post_template.html")

        await page.evaluate(
            """
        (data) => {
            document.getElementById("headline-text").innerText = data.headline;
            document.querySelector(".subtext").innerText = data.subtext;
            document.querySelector(".cta").innerText = data.cta;

            document.querySelector("#logo-img").setAttribute("src", data.logo)
            document.querySelector("#background-img").setAttribute("src", data.background_image)

            document.documentElement.style.setProperty("--brand-primary", data.brand_colors.primary)
            document.documentElement.style.setProperty("--brand-secondary", data.brand_colors.secondary)
            window.renderDone = false;
        }
        """,
            data,
        )

        await page.evaluate("fitContent()")
        await page.wait_for_function("window.renderDone === true")
        time.sleep(1)
        print(image_path)
        await page.screenshot(path=image_path)
        await browser.close()
