# Hyperviz Modules: AI Assistant Development Guidelines

## My Development Checklist

### 1. Before Making Changes
- [ ] Understand the existing codebase
- [ ] Review related documentation
- [ ] Check current build status for both modules:
  ```bash
  yarn workspace @hyperviz/worker build
  yarn workspace @hyperviz/weather build
  ```
- [ ] Verify test status for both modules:
  ```bash
  yarn workspace @hyperviz/worker test
  yarn workspace @hyperviz/weather test
  ```

### 2. During Development
- [ ] Make incremental changes
- [ ] Follow TypeScript best practices
- [ ] Maintain type safety
- [ ] Keep backward compatibility
- [ ] Document changes clearly
- [ ] Consider cross-module dependencies

### 3. After Changes
- [ ] Run main builds:
  ```bash
  yarn workspace @hyperviz/worker build
  yarn workspace @hyperviz/weather build
  ```
- [ ] Run example builds:
  ```bash
  yarn workspace @hyperviz/worker build:examples
  yarn workspace @hyperviz/weather build:examples
  ```
- [ ] Run tests:
  ```bash
  yarn workspace @hyperviz/worker test
  yarn workspace @hyperviz/weather test
  ```
- [ ] Document any new features or modifications
- [ ] Check cross-module compatibility

## Quality Standards

### 1. Code Quality
- Maintain strict type safety
- Follow existing patterns
- Write clear, maintainable code
- Keep related functionality together
- Use descriptive naming
- Ensure consistent patterns across modules

### 2. Error Handling
- Implement proper error handling
- Use appropriate error types
- Provide meaningful error messages
- Log errors appropriately
- Handle cross-module error propagation

### 3. Performance
- Monitor resource usage
- Optimize critical paths
- Handle edge cases
- Consider scalability
- Evaluate cross-module performance impact

## Problem Resolution

### 1. When Issues Arise
1. Verify build environment
2. Check dependencies (including cross-module)
3. Review recent changes
4. Test in isolation
5. Test cross-module interactions
6. Document findings

### 2. Common Issues
- Build failures
- Test timeouts
- Type errors
- Resource management issues
- Cross-module dependency issues
- Integration problems

### 3. Support Resources
- Review documentation
- Check issue tracker
- Consult team members
- Document solutions
- Consider module-specific solutions

## Continuous Improvement

### 1. Regular Checks
- Review and update practices
- Incorporate feedback
- Stay updated with dependencies
- Monitor technical debt
- Evaluate cross-module improvements

### 2. Documentation
- Keep documentation current
- Document API changes
- Maintain examples
- Update README as needed
- Document cross-module interactions

### 3. Code Review Focus
- Type safety
- Performance impact
- Error handling
- Documentation
- Test coverage
- Cross-module compatibility 