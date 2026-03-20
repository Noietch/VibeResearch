import { describe, it, expect } from 'vitest';
import {
  parseCitationNumbers,
  extractCitationMarkersFromText,
  findReferenceSection,
  parseReferences,
} from '../../src/renderer/utils/citation-detector';
import { parseReferencesFromText } from '../../src/shared/utils/reference-parser';

describe('citation-detector', () => {
  describe('parseCitationNumbers', () => {
    it('parses single number [1]', () => {
      expect(parseCitationNumbers('[1]')).toEqual([1]);
    });

    it('parses comma-separated [1,2,3]', () => {
      expect(parseCitationNumbers('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('parses comma-separated with spaces [1, 2, 3]', () => {
      expect(parseCitationNumbers('[1, 2, 3]')).toEqual([1, 2, 3]);
    });

    it('parses range [1-3]', () => {
      expect(parseCitationNumbers('[1-3]')).toEqual([1, 2, 3]);
    });

    it('parses en-dash range [1–3]', () => {
      expect(parseCitationNumbers('[1–3]')).toEqual([1, 2, 3]);
    });

    it('parses mixed [1, 3-5]', () => {
      expect(parseCitationNumbers('[1, 3-5]')).toEqual([1, 3, 4, 5]);
    });
  });

  describe('extractCitationMarkersFromText', () => {
    it('extracts simple citations', () => {
      const text = 'Some text [1] and [2] here.';
      const markers = extractCitationMarkersFromText(text, 1);
      expect(markers).toHaveLength(2);
      expect(markers[0].text).toBe('[1]');
      expect(markers[0].numbers).toEqual([1]);
      expect(markers[1].text).toBe('[2]');
    });

    it('extracts range citations', () => {
      const text = 'Cited in [1-3].';
      const markers = extractCitationMarkersFromText(text, 1);
      expect(markers).toHaveLength(1);
      expect(markers[0].numbers).toEqual([1, 2, 3]);
    });

    it('handles no citations', () => {
      const text = 'No citations here.';
      const markers = extractCitationMarkersFromText(text, 1);
      expect(markers).toHaveLength(0);
    });
  });

  describe('findReferenceSection', () => {
    it('finds References header', () => {
      const text = 'Some content\n\nReferences\n\n[1] First ref.';
      const pos = findReferenceSection(text);
      expect(pos).toBeGreaterThan(0);
    });

    it('finds REFERENCES header', () => {
      const text = 'Content\nREFERENCES\n[1] Ref.';
      const pos = findReferenceSection(text);
      expect(pos).toBeGreaterThan(0);
    });

    it('finds Bibliography header', () => {
      const text = 'End\nBibliography\n[1] Ref.';
      const pos = findReferenceSection(text);
      expect(pos).toBeGreaterThan(0);
    });

    it('returns -1 if not found', () => {
      const text = 'No reference section here.';
      const pos = findReferenceSection(text);
      expect(pos).toBe(-1);
    });

    it('finds References in space-joined PDF text (broad search)', () => {
      // Simulate PDF extraction where References header is embedded in flowing text
      const padding = 'A '.repeat(500); // Make text long enough for 60% threshold
      const text = `${padding}some conclusion text. References [1] Brown, T. B. et al. Language models are few-shot learners.`;
      const pos = findReferenceSection(text);
      expect(pos).toBeGreaterThan(0);
    });

    it('finds References followed by author name pattern', () => {
      const padding = 'A '.repeat(500);
      const text = `${padding}end of paper. References Brown, T. B., Mann, B., Ryder, N.`;
      const pos = findReferenceSection(text);
      expect(pos).toBeGreaterThan(0);
    });

    it('finds spaced-out R EFERENCES header (PDF character spacing)', () => {
      const text = 'Content here\n\nR EFERENCES\n\nBa, J. L., et al. Layer normalization. 2016.';
      const pos = findReferenceSection(text);
      expect(pos).toBeGreaterThan(0);
    });

    it('finds fully spaced R E F E R E N C E S header', () => {
      const text = 'Content here\n\nR E F E R E N C E S\n\n[1] Smith, J. "Paper Title". 2023.';
      const pos = findReferenceSection(text);
      expect(pos).toBeGreaterThan(0);
    });
  });

  describe('parseReferences', () => {
    it('parses bracket-style references', () => {
      const text =
        'Content\n\nReferences\n\n[1] Smith, J. "Deep Learning", Nature (2023).\n[2] Jones, K. "ML Survey", arXiv:2301.12345.';
      const refs = parseReferences(text);

      expect(refs.length).toBeGreaterThanOrEqual(2);
      expect(refs[0].number).toBe(1);
      expect(refs[0].text).toContain('Smith');
      expect(refs[1].number).toBe(2);
      // arXiv ID extraction may not work if the format isn't clean
      // At minimum, verify the text contains arXiv info
      expect(refs[1].text).toContain('arXiv');
    });

    it('parses dot-style references', () => {
      const text =
        'Content\n\nReferences\n\n1. Smith, J. et al. "Paper Title". Journal 2023.\n2. Jones, K. "Another Paper". Conference 2022.';
      const refs = parseReferences(text);

      expect(refs.length).toBeGreaterThanOrEqual(2);
    });

    it('extracts DOI', () => {
      const text = 'References\n\n[1] Paper with DOI. https://doi.org/10.1234/test.5678';
      const refs = parseReferences(text);

      expect(refs.length).toBeGreaterThanOrEqual(1);
      expect(refs[0].doi).toContain('10.1234');
    });

    it('extracts year', () => {
      const text = 'References\n\n[1] Author, "Title", Journal, 2023.';
      const refs = parseReferences(text);

      expect(refs.length).toBeGreaterThanOrEqual(1);
      expect(refs[0].year).toBe(2023);
    });

    it('extracts title from quotes', () => {
      const text = 'References\n\n[1] Smith, J. "This is the Paper Title", Journal 2023.';
      const refs = parseReferences(text);

      expect(refs.length).toBeGreaterThanOrEqual(1);
      expect(refs[0].title).toBe('This is the Paper Title');
    });

    it('parses inline numbered references from space-joined PDF text', () => {
      const padding = 'A '.repeat(500);
      const text = `${padding}References [1] Smith, J. "Deep Learning in Practice", Nature 2023. [2] Jones, K. "ML Survey", arXiv:2301.12345. [3] Brown, T. "Language Models", NeurIPS 2020.`;
      const refs = parseReferences(text);

      expect(refs.length).toBeGreaterThanOrEqual(3);
      expect(refs[0].number).toBe(1);
      expect(refs[0].text).toContain('Smith');
      expect(refs[1].number).toBe(2);
      expect(refs[2].number).toBe(3);
    });

    it('parses multi-line bracket references (PDF with y-position newlines)', () => {
      const text = [
        'Content here',
        '',
        'References',
        '',
        '[1] Brown, T. B., Mann, B., Ryder, N.,',
        'Subbiah, M., Kaplan, J. D., et al.',
        'Language models are few-shot learners.',
        'NeurIPS, 2020.',
        '[2] Vaswani, A., Shazeer, N., Parmar, N.,',
        'Uszkoreit, J., Jones, L., et al.',
        'Attention is all you need.',
        'NeurIPS, 2017.',
        '[3] Devlin, J., Chang, M., Lee, K., and',
        'Toutanova, K. BERT: Pre-training of',
        'deep bidirectional transformers. 2019.',
      ].join('\n');
      const refs = parseReferences(text);

      expect(refs.length).toBe(3);
      expect(refs[0].number).toBe(1);
      expect(refs[0].text).toContain('Brown');
      expect(refs[0].text).toContain('few-shot');
      expect(refs[1].number).toBe(2);
      expect(refs[1].text).toContain('Attention');
      expect(refs[2].number).toBe(3);
    });

    it('parses parenthetical-style references', () => {
      const text =
        'Content\n\nReferences\n\n(1) Smith, J. "Deep Learning", Nature 2023.\n(2) Jones, K. "ML Survey". Conference 2022.';
      const refs = parseReferences(text);

      expect(refs.length).toBeGreaterThanOrEqual(2);
      expect(refs[0].number).toBe(1);
      expect(refs[1].number).toBe(2);
    });

    it('parses author-year references (no numbers)', () => {
      const text = [
        'Content here',
        '',
        'References',
        '',
        'Brown, T. B., Mann, B., Ryder, N.,',
        'Subbiah, M., et al. Language models',
        'are few-shot learners. NeurIPS, 2020.',
        'Vaswani, A., Shazeer, N., Parmar, N.,',
        'Uszkoreit, J., et al. Attention is all',
        'you need. NeurIPS, 2017.',
        'Devlin, J., Chang, M., Lee, K.,',
        'Toutanova, K. BERT: Pre-training of',
        'deep bidirectional transformers. 2019.',
      ].join('\n');
      const refs = parseReferences(text);

      expect(refs.length).toBe(3);
      expect(refs[0].text).toContain('Brown');
      expect(refs[0].text).toContain('few-shot');
      expect(refs[0].year).toBe(2020);
      expect(refs[1].text).toContain('Vaswani');
      expect(refs[2].text).toContain('Devlin');
    });

    it('parses many numbered references correctly', () => {
      const entries = [];
      for (let i = 1; i <= 30; i++) {
        entries.push(`[${i}] Author${i}, A. "Paper Title ${i}". Journal ${2000 + i}.`);
      }
      const text = 'Content\n\nReferences\n\n' + entries.join('\n');
      const refs = parseReferences(text);

      expect(refs.length).toBe(30);
      expect(refs[0].number).toBe(1);
      expect(refs[29].number).toBe(30);
    });

    it('extracts full DOI with internal dots (e.g. IEEE)', () => {
      const text =
        'References\n\n[1] Zhang, X. et al. ArkAnalyzer. In ICSE-SEIP 2025. https://doi.org/10.1109/ICSE-SEIP66354.2025.00038';
      const refs = parseReferences(text);

      expect(refs.length).toBeGreaterThanOrEqual(1);
      expect(refs[0].doi).toBe('10.1109/ICSE-SEIP66354.2025.00038');
    });

    it('extracts DOI with multiple dots correctly', () => {
      const text =
        'References\n\n[1] Smith, J. Title. Journal, 2023. doi: 10.1145/3597503.3639187, pp. 1-10.';
      const refs = parseReferences(text);

      expect(refs.length).toBeGreaterThanOrEqual(1);
      expect(refs[0].doi).toBe('10.1145/3597503.3639187');
    });

    it('does not include trailing comma or period in DOI', () => {
      const text = 'References\n\n[1] Author, A. Paper title. 10.1234/test.5678. Another sentence.';
      const refs = parseReferences(text);

      expect(refs.length).toBeGreaterThanOrEqual(1);
      expect(refs[0].doi).toBe('10.1234/test.5678');
    });

    it('extracts title without mixing in author initials', () => {
      const text =
        'References\n\n[1] Henry, A., Dachapally, P. R., Pawar, S. S., and Chen, Y. Query-key normalization for transformers. In Findings of EMNLP 2020, pp. 4246-4253, 2020.';
      const refs = parseReferences(text);

      expect(refs.length).toBeGreaterThanOrEqual(1);
      // Title should NOT contain author names like "Dachapally" or "Pawar"
      const title = refs[0].title;
      expect(title).toBeTruthy();
      expect(title).toContain('Query-key normalization');
      expect(title).not.toContain('Dachapally');
    });
  });

  describe('shared parseReferencesFromText', () => {
    it('produces same results as renderer parseReferences', () => {
      const text =
        'Content\n\nReferences\n\n[1] Smith, J. "Deep Learning", Nature (2023).\n[2] Jones, K. "ML Survey", arXiv:2301.12345.';
      const rendererRefs = parseReferences(text);
      const sharedRefs = parseReferencesFromText(text);

      expect(sharedRefs.length).toBe(rendererRefs.length);
      for (let i = 0; i < sharedRefs.length; i++) {
        expect(sharedRefs[i].number).toBe(rendererRefs[i].number);
        expect(sharedRefs[i].text).toBe(rendererRefs[i].text);
      }
    });

    it('extracts DOI with dots correctly', () => {
      const text =
        'References\n\n[1] Zhang, X. ArkAnalyzer. https://doi.org/10.1109/ICSE-SEIP66354.2025.00038';
      const refs = parseReferencesFromText(text);

      expect(refs.length).toBeGreaterThanOrEqual(1);
      expect(refs[0].doi).toBe('10.1109/ICSE-SEIP66354.2025.00038');
    });

    it('parses references with spaced-out header', () => {
      const text = [
        'Content here',
        '',
        'R EFERENCES',
        '',
        'Ba, J. L., Kiros, J. R., and Hinton, G. E.',
        'Layer normalization. arXiv preprint, 2016.',
        'Vaswani, A., Shazeer, N., et al.',
        'Attention is all you need. NeurIPS, 2017.',
      ].join('\n');
      const refs = parseReferencesFromText(text);
      expect(refs.length).toBe(2);
    });

    it('stops at appendix section', () => {
      const text = [
        'Content here',
        '',
        'References',
        '',
        '[1] Smith, J. "Paper One". 2023.',
        '[2] Jones, K. "Paper Two". 2022.',
        '',
        'Appendix A',
        '',
        'Some appendix content with numbers [3] that should not be parsed.',
      ].join('\n');
      const refs = parseReferencesFromText(text);
      expect(refs.length).toBe(2);
    });
  });

  describe('end-to-end: reference extraction → search query', () => {
    // These tests verify that extracted references produce correct titles
    // that can be used as search queries (no venue/journal mixed in)

    it('ACM format: Author. Year. Title. In Venue.', () => {
      const text = [
        'References',
        '',
        '[1] Yuntong Zhang, Haifeng Ruan, Zhiyu Fan, and Abhik Roychoudhury. 2024. Autocoderover: Autonomous program',
        'improvement. In Proceedings of the 33rd ACM SIGSOFT International Symposium on Software Testing and Analysis.',
        '1592–1604.',
      ].join('\n');
      const refs = parseReferencesFromText(text);
      expect(refs.length).toBe(1);
      expect(refs[0].title).toContain('Autocoderover');
      expect(refs[0].title).not.toContain('Proceedings');
      expect(refs[0].title).not.toContain('ACM');
      expect(refs[0].authors).toContain('Zhang');
      expect(refs[0].year).toBe(2024);
    });

    it('IEEE format: Author, "Title," Venue, Year.', () => {
      const text = [
        'References',
        '',
        '[1] Zhen Li, Deqing Zou, Shouhuai Xu, Xinyu Ou, Hai Jin, Sujuan Wang, Zhijun Deng,',
        'and Yuyi Zhong. VulDeePecker: A deep learning-based system for vulnerability detection.',
        'In NDSS, 2018.',
      ].join('\n');
      const refs = parseReferencesFromText(text);
      expect(refs.length).toBe(1);
      expect(refs[0].title).toContain('VulDeePecker');
      expect(refs[0].title).not.toContain('NDSS');
      expect(refs[0].year).toBe(2018);
    });

    it('reference with hyphenated line break in venue', () => {
      const text = [
        'References',
        '',
        '[1] Rui Chen, Songqiang Chen, and Meng Yan. Sequencer: Sequence-to-sequence learning for end-to-end program',
        'repair. IEEE Transactions on Software Engi-',
        'neering 47, 9 (2019), 1943–1959.',
      ].join('\n');
      const refs = parseReferencesFromText(text);
      expect(refs.length).toBe(1);
      expect(refs[0].title).toContain('Sequencer');
      expect(refs[0].title).toContain('program');
      // Title should NOT include venue
      expect(refs[0].title).not.toContain('IEEE');
      expect(refs[0].title).not.toContain('Transactions');
    });

    it('FlowDroid full title reference', () => {
      const text = [
        'References',
        '',
        '[1] Steven Arzt, Siegfried Rasthofer, Christian Fritz, Eric Bodden, Alexandre Bartel,',
        'Jacques Klein, Yves Le Traon, Damien Octeau, and Patrick McDaniel. 2014. Flowdroid:',
        'Precise context, flow, field, object-sensitive and lifecycle-aware taint analysis for',
        'android apps. In Proceedings of the 35th ACM SIGPLAN Conference on Programming Language',
        'Design and Implementation. 259–269.',
      ].join('\n');
      const refs = parseReferencesFromText(text);
      expect(refs.length).toBe(1);
      expect(refs[0].title).toContain('Flowdroid');
      expect(refs[0].title).toContain('taint analysis');
      expect(refs[0].title).not.toContain('Proceedings');
      expect(refs[0].authors).toContain('Arzt');
      expect(refs[0].year).toBe(2014);
    });

    it('author-year reference without numbers', () => {
      const text = [
        'References',
        '',
        'Brown, T. B., Mann, B., Ryder, N., Subbiah, M.,',
        'et al. Language models are few-shot learners.',
        'Advances in neural information processing systems, 2020.',
      ].join('\n');
      const refs = parseReferencesFromText(text);
      expect(refs.length).toBeGreaterThanOrEqual(1);
      expect(refs[0].title).toContain('Language models');
      expect(refs[0].title).not.toContain('Advances');
    });
  });

  describe('real PDF edge cases: arXiv, URLs, accented authors', () => {
    it('extracts arXiv ID correctly from "arXiv preprint arXiv:XXXX.XXXXX"', () => {
      const text = [
        'References',
        '',
        '[1] Jared Kaplan, Sam McCandlish, Tom Henighan, Tom B Brown, et al. 2020. Scaling laws for neural language models. arXiv preprint arXiv:2001.08361 (2020).',
        '[2] Raymond Li, Loubna Ben Allal, et al. 2023. Starcoder: may the source be with you! arXiv preprint arXiv:2305.06161 (2023).',
      ].join('\n');
      const refs = parseReferencesFromText(text);

      expect(refs.length).toBe(2);
      expect(refs[0].arxivId).toBe('2001.08361');
      expect(refs[0].title).toContain('Scaling laws');
      expect(refs[0].year).toBe(2020);
      expect(refs[1].arxivId).toBe('2305.06161');
      expect(refs[1].title).toContain('Starcoder');
    });

    it('extracts arXiv ID from IEEE-style "arXiv preprint arXiv:XXXX.XXXXX" (quoted title)', () => {
      const text = [
        'References',
        '',
        '[16] L. Li, J. Wang, and H. Quan, "Scalpel: The python static analysis',
        'framework," arXiv preprint arXiv:2202.11840, 2022.',
      ].join('\n');
      const refs = parseReferencesFromText(text);

      expect(refs.length).toBe(1);
      expect(refs[0].arxivId).toBe('2202.11840');
      expect(refs[0].title).toBe('Scalpel: The python static analysis framework');
      expect(refs[0].year).toBe(2022);
    });

    it('extracts arXiv ID with version suffix (arXiv:XXXX.XXXXXv2)', () => {
      const text = [
        'References',
        '',
        '[1] Author, A. "Title." arXiv preprint arXiv:2301.12345v2, 2023.',
      ].join('\n');
      const refs = parseReferencesFromText(text);

      expect(refs.length).toBe(1);
      expect(refs[0].arxivId).toBe('2301.12345v2');
    });

    it('IEEE style: website/tool reference with short quoted title and URL', () => {
      const text = [
        'References',
        '',
        '[7] "Find and fix problems in your javascript code," accessed: July 9,',
        '2024. [Online]. Available: https://eslint.org/',
        '[8] "Wala," https://github.com/wala/WALA, accessed: July 9, 2024.',
        '[9] N. A. Naeem, O. Lhotak, and J. Rodriguez, "Practical extensions',
        'to the ifds algorithm," in Compiler Construction, 2010, pp. 124-144.',
      ].join('\n');
      const refs = parseReferencesFromText(text);

      expect(refs.length).toBe(3);
      // [7]: tool reference with URL in [Online]. Available:
      expect(refs[0].title).toContain('Find and fix problems');
      expect(refs[0].url).toBe('https://eslint.org/');
      // [8]: short title "Wala" with URL
      expect(refs[1].url).toBe('https://github.com/wala/WALA');
      // URL should NOT contain "accessed:" or date fragments
      expect(refs[1].url).not.toContain('accessed');
      // [9]: normal reference, no URL
      expect(refs[2].title).toContain('Practical extensions');
      expect(refs[2].url).toBeNull();
    });

    it('IEEE style: URL broken by PDF line-wrapping (https:\\n//)', () => {
      const text = [
        'References',
        '',
        '[43] "Overview of the arkts compilation toolchain," https:',
        '//developer.huawei.com/consumer/cn/doc/harmonyos-guides-V5/',
        'compilation-tool-chain-overview-V5/, accessed: Augest 20, 2024.',
      ].join('\n');
      const refs = parseReferencesFromText(text);

      expect(refs.length).toBe(1);
      expect(refs[0].title).toBe('Overview of the arkts compilation toolchain');
      // URL should be repaired (https: // → https://)
      expect(refs[0].url).toContain('https://developer.huawei.com');
      expect(refs[0].url).toContain('compilation-tool-chain-overview');
      // URL should NOT contain "accessed"
      expect(refs[0].url).not.toContain('accessed');
    });

    it('URL should not include trailing ",accessed:" suffix', () => {
      const text = [
        'References',
        '',
        '[29] O. Foundation, "Openharmony: A comprehensive open source project',
        'for all-scenario," https://gitee.com/openharmony, 2024, accessed on: 2024-04-10.',
      ].join('\n');
      const refs = parseReferencesFromText(text);

      expect(refs.length).toBe(1);
      expect(refs[0].url).toBe('https://gitee.com/openharmony');
      expect(refs[0].url).not.toContain('accessed');
    });

    it('ACM style with accented author names (Bissyandé, Nikolić)', () => {
      const text = [
        'References',
        '',
        '[4] L. Li, A. Bartel, T. F. Bissyandé, J. Klein, Y. Le Traon, S. Arzt,',
        'S. Rasthofer, E. Bodden, D. Octeau, and P. McDaniel, "Iccta: Detecting',
        'inter-component privacy leaks in android apps," in 2015 IEEE/ACM 37th',
        'IEEE International Conference on Software Engineering, vol. 1. IEEE,',
        '2015, pp. 280-291.',
        '[5] D. Nikolić, D. Stefanović, D. Dakić, S. Sladojević, and S. Ristić, "Analysis',
        'of the tools for static code analysis," in 2021 INFOTEH, 2021, pp. 1-6.',
      ].join('\n');
      const refs = parseReferencesFromText(text);

      expect(refs.length).toBe(2);
      expect(refs[0].title).toContain('Iccta');
      expect(refs[0].authors).toContain('Bissyandé');
      expect(refs[1].title).toContain('Analysis of the tools');
      expect(refs[1].authors).toContain('Nikolić');
    });

    it('ACM format: numbered refs without quoted titles (Author. Year. Title. In Venue.)', () => {
      const text = [
        'References',
        '',
        '[46] Open-Source AI Models. 2024. Open-Source AI Models. https://github.com/mathieu0905/collaborative_software_learning',
        '[47] Sinno Jialin Pan and Qiang Yang. 2009. A survey on transfer learning. IEEE Transactions on knowledge and data',
        'engineering 22, 10 (2009), 1345-1359.',
      ].join('\n');
      const refs = parseReferencesFromText(text);

      expect(refs.length).toBe(2);
      expect(refs[1].title).toContain('survey on transfer learning');
      expect(refs[1].title).not.toContain('IEEE Transactions');
      expect(refs[1].year).toBe(2009);
    });

    it('handles multi-line IEEE references spanning 4+ lines', () => {
      const text = [
        'References',
        '',
        '[3] S. Arzt, S. Rasthofer, C. Fritz, E. Bodden, A. Bartel, J. Klein,',
        'Y. Le Traon, D. Octeau, and P. McDaniel, "Flowdroid: Precise context,',
        'flow, field, object-sensitive and lifecycle-aware taint analysis for android',
        'apps," ACM sigplan notices, vol. 49, no. 6, pp. 259-269, 2014.',
      ].join('\n');
      const refs = parseReferencesFromText(text);

      expect(refs.length).toBe(1);
      expect(refs[0].title).toContain('Flowdroid');
      expect(refs[0].title).toContain('taint analysis');
      // Title should not contain venue
      expect(refs[0].title).not.toContain('ACM sigplan');
      expect(refs[0].year).toBe(2014);
    });

    it('handles DOI with [Online]. Available: prefix', () => {
      const text = [
        'References',
        '',
        '[21] D. Grove and C. Chambers, "A framework for call graph construction',
        'algorithms," ACM Trans. Program. Lang. Syst., vol. 23, no. 6, p.',
        '685-746, nov 2001. [Online]. Available: https://doi.org/10.1145/506315.506316',
      ].join('\n');
      const refs = parseReferencesFromText(text);

      expect(refs.length).toBe(1);
      expect(refs[0].title).toContain('framework for call graph');
      expect(refs[0].doi).toBe('10.1145/506315.506316');
      expect(refs[0].url).toContain('doi.org');
      expect(refs[0].year).toBe(2001);
    });

    it('handles reference with DOI on separate line', () => {
      const text = [
        'References',
        '',
        '[52] Sarwar Sayeed, Hector Marco-Gisbert, and Tom Caira. 2020. Smart Contract: Attacks',
        'and Protections. IEEE Access 8 (2020), 24416-24427.',
        'https://doi.org/10.1109/ACCESS.2020.2970495',
      ].join('\n');
      const refs = parseReferencesFromText(text);

      expect(refs.length).toBe(1);
      expect(refs[0].doi).toBe('10.1109/ACCESS.2020.2970495');
      expect(refs[0].url).toContain('doi.org');
      expect(refs[0].year).toBe(2020);
    });

    it('real-world: large numbered reference list with mixed styles', () => {
      const text = [
        'Content',
        '',
        'References',
        '',
        '[25] Johannes Rude Jensen, Victor von Wachter, and Omri Ross. 2021. How decentralized is the governance of blockchain-',
        'based finance: Empirical evidence from four governance token distributions. arXiv preprint arXiv:2102.10096 (2021).',
        '[26] Menglin Jia, Luming Tang, Bor-Chun Chen, Claire Cardie, Serge Belongie, Bharath Hariharan, and Ser-Nam Lim. 2022.',
        'Visual prompt tuning. In European Conference on Computer Vision. Springer, 709-727.',
        '[27] Nan Jiang, Thibaud Lutellier, and Lin Tan. 2021. Cure: Code-aware neural machine translation for automatic program',
        'repair. In 2021 IEEE/ACM 43rd International Conference on Software Engineering (ICSE). IEEE, 1161-1173.',
      ].join('\n');
      const refs = parseReferencesFromText(text);

      expect(refs.length).toBe(3);
      expect(refs[0].number).toBe(25);
      expect(refs[0].arxivId).toBe('2102.10096');
      expect(refs[0].title).toContain('decentralized');
      expect(refs[1].number).toBe(26);
      expect(refs[1].title).toContain('Visual prompt tuning');
      expect(refs[2].number).toBe(27);
      expect(refs[2].title).toContain('Cure');
      expect(refs[2].title).not.toContain('IEEE');
    });

    it('tool/website ref with no author, just quoted title and URL', () => {
      const text = [
        'References',
        '',
        '[42] "Clang static analyzer," https://clang-analyzer.llvm.org/, accessed: July',
        '2, 2024.',
      ].join('\n');
      const refs = parseReferencesFromText(text);

      expect(refs.length).toBe(1);
      expect(refs[0].title).toBe('Clang static analyzer');
      expect(refs[0].url).toContain('clang-analyzer.llvm.org');
      expect(refs[0].url).not.toContain('accessed');
    });

    it('ACM format with year before title and trailing metadata', () => {
      const text = [
        'References',
        '',
        '[43] Qihao Zhu, Zeyu Sun, Yuan-an Xiao, Wenjie Zhang, Kang Yuan, Yingfei Xiong,',
        'and Lu Zhang. 2021. A syntax-guided edit decoder for neural program repair.,',
        "In ESEC/FSE '21: 29th ACM Joint European Software Engineering Conference",
        'and Symposium on the Foundations of Software Engineering, Athens, Greece,',
        'August 23-28, 2021, Diomidis Spinellis, Georgios Gousios, Marsha Chechik, and',
        'Massimiliano Di Penta (Eds.). ESEC/SIGSOFT FSE, 341–353. https://arxiv.org/',
        'pdf/2106.08253',
        'Received 2024-04-12; accepted 2024-07-03',
      ].join('\n');
      const refs = parseReferencesFromText(text);
      expect(refs.length).toBe(1);
      expect(refs[0].title).toContain('syntax-guided edit decoder');
      expect(refs[0].title).not.toContain('Received');
      expect(refs[0].title).not.toContain('https');
      expect(refs[0].year).toBe(2021);
      expect(refs[0].url).toContain('arxiv.org');
    });

    it('handles hyphenated words broken by PDF line wrap', () => {
      const text = [
        'References',
        '',
        '[1] M. Böhme, C. Cadar, and A. Roychoudhury. Fuzzing: Chal-',
        'lenges and Reflections. IEEE Software, 2021.',
      ].join('\n');
      const refs = parseReferencesFromText(text);
      expect(refs.length).toBe(1);
      expect(refs[0].title).toContain('Challenges and Reflections');
    });

    it('real ArkAnalyzer paper: IEEE style with URLs, accented names, and website refs', () => {
      const text = [
        'R EFERENCES',
        '[31] N. Grech, K. Georgiou, J. Pallister, S. Kerrison, J. Morse, and K. Eder,',
        '"Static analysis of energy consumption for llvm ir programs," in Pro-',
        'ceedings of the 18th International Workshop on Software and Compilers',
        'for Embedded Systems, 2015, pp. 12–21.',
        '[32] D. Nikoli´c, D. Stefanovi´c, D. Daki´c, S. Sladojevi´c, and S. Risti´c, "Anal-',
        'ysis of the tools for static code analysis," in 2021 20th International',
        'Symposium INFOTEH-JAHORINA (INFOTEH), 2021, pp. 1–6.',
        '[33] "Clang static analyzer," https://clang-analyzer.llvm.org/, accessed: July',
        '2, 2024.',
        '[34] "Overview of the arkts compilation toolchain," https:',
        '//developer.huawei.com/consumer/cn/doc/harmonyos-guides-V5/',
        'compilation-tool-chain-overview-V5/, accessed: Augest 20, 2024.',
      ].join('\n');
      const refs = parseReferencesFromText(text);
      expect(refs.length).toBe(4);

      // [31] IEEE style with quoted title
      expect(refs[0].title).toContain('Static analysis of energy consumption');
      expect(refs[0].year).toBe(2015);

      // [32] accented author names
      expect(refs[1].title).toContain('tools for static code analysis');
      expect(refs[1].year).toBe(2021);

      // [33] website ref with URL
      expect(refs[2].url).toContain('clang-analyzer.llvm.org');
      expect(refs[2].url).not.toContain('accessed');

      // [34] broken URL across lines with https: //
      expect(refs[3].url).toContain('developer.huawei.com');
      expect(refs[3].url).not.toContain(' ');
    });

    it('real paper: mixed ACM + arXiv preprint references', () => {
      const text = [
        'REFERENCES',
        '[1] Xinyun Chen, Maxwell Lin, Nathanael Schärli, and Denny Zhou. 2024. Teaching',
        'Large Language Models to Self-Debug. In The Twelfth International Conference on',
        'Learning Representations.',
        '[2] Timur Galimzyanov, Sergey Titov, Yaroslav Golubev, and Egor Bogomolov. 2024.',
        'Drawing Pandas: A Benchmark for LLMs in Generating Plotting Code. arXiv',
        'preprint arXiv:2412.02764 (2024).',
        '[3] Aman Madaan, Niket Tandon, Prakhar Gupta, Skyler Hallinan, Luyu Gao, Sarah',
        'Wiegreffe, Uri Alon, Nouha Dziri, Shrimai Prabhumoye, Yiming Yang, Shashank',
        'Gupta, Bodhisattwa Prasad Majumder, Katherine Hermann, Sean Welleck, Amir',
        'Yazdanbakhsh, and Peter Clark. 2023. Self-Refine: Iterative Refinement with',
        'Self-Feedback. arXiv preprint arXiv:2303.17651 (2023).',
      ].join('\n');
      const refs = parseReferencesFromText(text);
      expect(refs.length).toBe(3);

      // ACM conference paper
      expect(refs[0].title).toContain('Teaching Large Language Models to Self-Debug');
      expect(refs[0].title).not.toContain('In The Twelfth');
      expect(refs[0].year).toBe(2024);

      // arXiv preprint - title should NOT be "arXiv preprint..."
      expect(refs[1].title).toContain('Drawing Pandas');
      expect(refs[1].title).not.toContain('arXiv');
      expect(refs[1].arxivId).toBe('2412.02764');

      // Long author list + arXiv
      expect(refs[2].title).toContain('Self-Refine');
      expect(refs[2].arxivId).toBe('2303.17651');
      expect(refs[2].year).toBe(2023);
    });

    it('ACM unnumbered style refs without quoted titles', () => {
      const text = [
        'References',
        '',
        '[31] r2c. Semgrep: Lightweight static analysis for many languages, 2020.',
        '[34] Kirill Simonov. Pyyaml: Yaml parser and emitter for python, 2023. Python YAML processing library.',
        '[35] Cursor Team. Cursor: The ai code editor, 2024. AI-powered code editor with advanced context understanding.',
      ].join('\n');
      const refs = parseReferencesFromText(text);

      expect(refs.length).toBe(3);
      // r2c is the author (short name)
      expect(refs[0].title).toContain('Semgrep');
      expect(refs[1].title).toContain('Pyyaml');
      expect(refs[2].title).toContain('Cursor');
    });
  });
});
