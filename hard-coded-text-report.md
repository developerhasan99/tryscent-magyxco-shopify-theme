# Hard-Coded English Text in Shopify Theme

This report lists all hard-coded English text found in the Shopify theme liquid files that should be localized for internationalization.

---

## Sections

### builder-hero.liquid
- "10,000s Happy Customers"
- "Create Your Bundle!"
- "Best scents you've ever smelled or your money back."
- "Select Up To 5 Bottles To Get $100 OFF"
- "Get Up To 4 Bottles For"
- "FREE"
- "Get to try more scents. Keep some, give some!"
- "Add to cart & enjoy TryScent"
- "We offer 60-day satisfaction guarantee."
- "Works for work, dates, or just hanging out. Can't go wrong with this one."
- "Verified Customer"
- "This scent makes me feel like I can take on anything. Long-lasting and powerful."
- "Smells expensive but doesn't hurt my wallet. Great deals on this site too."

### magic-compare.liquid
- "⭐ Recommended"
- "TryScent"
- "Shop TryScent Now"
- "Expensive Luxury Brands"

### scent-breakdown.liquid
- "Scent Breakdown"
- "Top Notes"
- "Middle Notes"
- "Base Notes"


---

## Templates

### page.spin-to-win.liquid
- "SPIN TO WIN"
- "WIN FROM ONE FREE BOTTLE UP TO FOUR"
- "💰 SUMMER SUPER GIVEAWAY 💰"
- "LIMITED TIME OFFER"
- "ENDS IN:"
- "big red button that says press to play" (alt text)
- "GET UP TO 4 FREE BOTTLES!"
- "ribbon with text 'Top Prize'" (alt text)
- "UP"
- "TO"
- "67%"
- "OFF"
- "WITH 4 FREE GIFTS"
- "CLAIM DISCOUNT"
- "arrow pointing right" (alt text)
- "Your browser does not support the video tag."

### page.free-sample.liquid
- "5,000+ Happy TryScent explorers"
- "Get A"
- "FREE Sample Box"
- "Of"
- "Luxury Scents"
- "3 x Premium Decants (your choice of vibes)"
- "Up To 70% Off Retail Prices"
- "Free shipping orders $49+ | Free gifts available"
- "Start with samples & expert ideas"
- "YES! I WANT MY FREE SAMPLES"
- "Limited Offer - ONE Per Customer Only. While quantities last."
- "Receive 3 premium scent decants. Just Pay Shipping."
- "VOGUE"
- "GQ"
- "Harper's BAZAAR"
- "Cosmopolitan"
- "ELLE"
- "Save Up To"
- "$300"
- "On Your Fragrance Budget"
- "You shouldn't have to choose between a luxury scent and your next adventure!"
- "Expensive Choice"
- "Traditional Retail"
- "Full Retail Bottle" (alt text)
- "Fragrance enthusiasts typically spend $300+ on a single luxury bottle."
- "Smart Choice"
- "TryScent Decants"
- "TryScent Sampler" (alt text)
- "Achieve an elite collection for only $24-$49 and save the rest for your future."
- "500,000+ Happy scent explorers"
- "Long lasting Scent Guarantee"
- "What our Customers Say"
- "Highly recommend."
- "From customer service to the product itself, the experience was excellent. Everything arrived as expected, and I'd happily purchase again."
- "Verified Buyer"
- "Arrived perfectly."
- "The product was well packaged, arrived in great condition, and the scent quality exceeded my expectations. Very happy with this purchase."
- "Great value for money."
- "I was genuinely impressed by the quality. The scent holds up well and feels comparable to much more expensive brands."
- "Our Guarantees"
- "Your TryScent collection comes with complete peace of mind:"
- "Satisfaction Guarantee"
- "If you're not satisfied with your scents, we'll work with you to make things right and find your perfect match."
- "Fast service guarantee"
- "We ship all orders within 24 business hours. If we're late, you get a $10 gift card for your next discovery."
- "Full Bottle Credit"
- "Love a sample? Your sample box cost is credited toward your first full-sized bottle purchase from our shop."


---

## Snippets

### cart-upsells.liquid
- "Select variant" (aria-label)


### special-offer-products-modal.liquid
- "YOUR BUNDLE IS READY! 👑"
- "ADD"
- "MORE SCENT"
- "S"
- "Top Sellers"
- "Top Sellers Men"
- "Top Sellers Women"
- "Loading..."
- "Redirecting To Checkout..."

---


---

## Notes

1. **Scope**: This report only includes hard-coded text found in HTML/template parts and template JSON files. Schema labels and schema default values are excluded as they don't appear on the frontend.

2. **Swedish Text Found**: Some files contain Swedish text (e.g., `cart-upsells.liquid`). These have been excluded from this report as it focuses on English text only.

3. **Translation System**: Many files properly use Shopify's translation system with the `| t` filter. These are correctly internationalized and do not need changes.

4. **Alt Text**: Several images have hard-coded English alt text that should be localized for accessibility.

5. **JavaScript Strings**: Some JavaScript strings are hard-coded in English and should be extracted to translatable variables.

---

## Recommendations

1. Extract all hard-coded text to Shopify's locale files (e.g., `en.default.json`)
2. Use the `{{ 'key' | t }}` filter for all user-facing text
3. Ensure all alt text is translatable
4. Extract JavaScript strings to translatable variables

---

**Report Generated**: January 2025
**Theme**: tryscent-shopify-theme
