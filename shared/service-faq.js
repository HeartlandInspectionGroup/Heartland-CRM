/**
 * Heartland Inspection Group — Service Page FAQ Loader
 * 
 * Usage: Add to any service page before </body>:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
 *   <script src="../shared/service-faq.js" data-slug="radon-testing"></script>
 * 
 * The FAQ section HTML should already exist on the page:
 *   <section class="service-faq" id="faq">
 *     <div class="faq-container">
 *       <div class="section-header">
 *         <div class="section-label">Common Questions</div>
 *         <h2 class="section-title">[Service Name] FAQ</h2>
 *       </div>
 *       <div id="serviceFaqList"></div>
 *     </div>
 *   </section>
 */
(function(){
  'use strict';

  // Read slug from the script tag's data-slug attribute
  var scripts = document.querySelectorAll('script[data-slug]');
  var thisScript = scripts[scripts.length - 1];
  var slug = thisScript ? thisScript.getAttribute('data-slug') : '';
  if(!slug) return;

  var SUPABASE_URL = 'https://fusravedbksupcsjfzda.supabase.co';
  var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
  var sb = window._heartlandSB || supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  if (!window._heartlandSB) window._heartlandSB = sb;

  sb.from('service_faqs')
    .select('question, answer')
    .eq('service_slug', slug)
    .eq('active', true)
    .order('sort_order')
    .then(function(res){
      var faqs = (res.data || []);
      var section = document.getElementById('faq');
      var list = document.getElementById('serviceFaqList');
      if(!faqs.length || !section || !list){
        if(section) section.style.display = 'none';
        return;
      }

      // Render accordion items
      var html = '';
      for(var i = 0; i < faqs.length; i++){
        html += '<div class="sfaq-item">';
        html += '<button class="sfaq-question" aria-expanded="false">';
        html += faqs[i].question;
        html += '<span class="sfaq-icon">&#9662;</span>';
        html += '</button>';
        html += '<div class="sfaq-answer"><div class="sfaq-answer-inner">' + faqs[i].answer + '</div></div>';
        html += '</div>';
      }
      list.innerHTML = html;

      // Accordion toggle — one open at a time
      list.querySelectorAll('.sfaq-question').forEach(function(btn){
        btn.addEventListener('click', function(){
          var item = this.parentElement;
          var wasOpen = item.classList.contains('open');
          // Close all
          list.querySelectorAll('.sfaq-item.open').forEach(function(el){
            el.classList.remove('open');
            el.querySelector('.sfaq-question').setAttribute('aria-expanded','false');
          });
          // Open clicked (if it was closed)
          if(!wasOpen){
            item.classList.add('open');
            this.setAttribute('aria-expanded','true');
          }
        });
      });

      // Inject Schema.org FAQPage structured data for SEO
      var schema = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'mainEntity': faqs.map(function(f){
          return {
            '@type': 'Question',
            'name': f.question,
            'acceptedAnswer': { '@type': 'Answer', 'text': f.answer }
          };
        })
      };
      var script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    });
})();
